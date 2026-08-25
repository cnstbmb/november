#!/usr/bin/env python3
import hmac
import http.server
import json
import math
import os
import pathlib
import socket
import socketserver
import stat
import subprocess
import sys


class PolicyError(ValueError):
    pass


class ActionPolicy:
    _CONTAINERS = {
        "samba": "samba",
        "qbittorrent": "qbittorrent",
        "jellyfin": "jellyfin",
    }

    def container_for(self, service):
        try:
            return self._CONTAINERS[service]
        except (KeyError, TypeError):
            raise PolicyError("service is not allowed")


class DockerExecutor:
    def __init__(self, run=subprocess.run, docker_binary="/usr/bin/docker"):
        self._run = run
        self._docker_binary = docker_binary

    def restart(self, container):
        self._run(
            [self._docker_binary, "restart", container],
            check=True,
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,
        )


class SystemStatusProvider:
    _MEMORY_KEYS = ("MemTotal", "MemAvailable", "SwapTotal", "SwapFree")

    def __init__(
        self,
        proc_root="/proc",
        thermal_root="/sys/class/thermal",
        disk_path="/",
        statvfs=os.statvfs,
    ):
        self._proc_root = pathlib.Path(proc_root)
        self._thermal_root = pathlib.Path(thermal_root)
        self._disk_path = disk_path
        self._statvfs = statvfs

    @staticmethod
    def _finite_nonnegative(value, label):
        number = float(value)
        if not math.isfinite(number) or number < 0:
            raise ValueError(f"invalid {label}")
        return number

    def _memory(self):
        values = {}
        for line in (self._proc_root / "meminfo").read_text(encoding="utf-8").splitlines():
            key, separator, remainder = line.partition(":")
            if separator and key in self._MEMORY_KEYS:
                parts = remainder.split()
                if len(parts) != 2 or parts[1] != "kB":
                    raise ValueError(f"invalid {key}")
                values[key] = int(self._finite_nonnegative(parts[0], key) * 1024)
        if set(values) != set(self._MEMORY_KEYS):
            raise ValueError("incomplete meminfo")
        return values

    def _temperature(self):
        temperatures = []
        for path in self._thermal_root.glob("thermal_zone*/temp"):
            millidegrees = self._finite_nonnegative(path.read_text(encoding="utf-8").strip(), "temperature")
            temperatures.append(millidegrees / 1000)
        if not temperatures:
            raise ValueError("temperature is unavailable")
        return max(temperatures)

    def snapshot(self):
        memory = self._memory()
        load_parts = (self._proc_root / "loadavg").read_text(encoding="utf-8").split()
        if len(load_parts) < 3:
            raise ValueError("invalid loadavg")
        load_average = [self._finite_nonnegative(value, "load average") for value in load_parts[:3]]
        uptime_parts = (self._proc_root / "uptime").read_text(encoding="utf-8").split()
        if not uptime_parts:
            raise ValueError("invalid uptime")
        uptime_seconds = self._finite_nonnegative(uptime_parts[0], "uptime")
        disk = self._statvfs(self._disk_path)

        return {
            "memory": {
                "totalBytes": memory["MemTotal"],
                "availableBytes": memory["MemAvailable"],
            },
            "swap": {
                "totalBytes": memory["SwapTotal"],
                "freeBytes": memory["SwapFree"],
            },
            "disk": {
                "totalBytes": int(disk.f_blocks * disk.f_frsize),
                "freeBytes": int(disk.f_bavail * disk.f_frsize),
            },
            "temperatureCelsius": self._temperature(),
            "loadAverage": load_average,
            "uptimeSeconds": uptime_seconds,
        }


class StorageStatusProvider:
    _VOLUMES = (
        ("Система", "/"),
        ("SSD", "/mnt/ssd"),
        ("HDD", "/mnt/hdd"),
        ("Логи", "/var/log"),
    )

    def __init__(self, statvfs=os.statvfs, is_mount=os.path.ismount):
        self._statvfs = statvfs
        self._is_mount = is_mount

    def snapshot(self):
        volumes = []
        for name, mount_point in self._VOLUMES:
            if not self._is_mount(mount_point):
                continue
            disk = self._statvfs(mount_point)
            volumes.append({
                "name": name,
                "mountPoint": mount_point,
                "totalBytes": int(disk.f_blocks * disk.f_frsize),
                "freeBytes": int(disk.f_bavail * disk.f_frsize),
            })
        return {"volumes": volumes}


class ServiceStatusProvider:
    _SYSTEMD_SERVICES = (
        ("Docker", "docker.service"),
        ("SSH", "ssh.service"),
        ("DNS", "systemd-resolved.service"),
        ("Action broker", "home-ai-action-broker.service"),
    )
    _CONTAINERS = (
        ("Samba", "samba"),
        ("qBittorrent", "qbittorrent"),
        ("Jellyfin", "jellyfin"),
        ("RemnaNode", "remnanode"),
        ("Jarvis", "home-ai-bot-1"),
        ("RKLLM", "home-ai-rkllm-1"),
        ("LiveSync proxy", "livesync-proxy"),
        ("LiveSync CouchDB", "livesync-couchdb"),
        ("Promtail", "monitoring-promtail"),
        ("Node exporter", "monitoring-node-exporter"),
        ("Landing", "landing-lite"),
    )

    def __init__(
        self,
        run=subprocess.run,
        systemd_services=None,
        containers=None,
    ):
        self._run = run
        self._systemd_services = systemd_services or self._SYSTEMD_SERVICES
        self._containers = containers or self._CONTAINERS

    def _execute(self, argv):
        return self._run(
            argv,
            check=False,
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5,
        )

    def _systemd(self, name, unit):
        try:
            result = self._execute([
                "/usr/bin/systemctl",
                "show",
                "--property=ActiveState",
                "--value",
                unit,
            ])
            state = result.stdout.strip() if result.returncode == 0 else "unavailable"
        except (OSError, subprocess.SubprocessError):
            state = "unavailable"
        return {
            "name": name,
            "kind": "systemd",
            "state": state,
            "health": None,
            "ok": state == "active",
        }

    def _container(self, name, container):
        state = "missing"
        health = None
        try:
            result = self._execute([
                "/usr/bin/docker",
                "inspect",
                "--format",
                "{{json .State}}",
                container,
            ])
            if result.returncode == 0:
                payload = json.loads(result.stdout)
                state = str(payload.get("Status", "unknown"))
                health_payload = payload.get("Health")
                if isinstance(health_payload, dict):
                    health = str(health_payload.get("Status", "unknown"))
        except (json.JSONDecodeError, OSError, subprocess.SubprocessError, TypeError):
            state = "unavailable"
        ok = state == "running" and health not in ("unhealthy", "starting")
        return {
            "name": name,
            "kind": "container",
            "state": state,
            "health": health,
            "ok": ok,
        }

    def snapshot(self):
        services = [self._systemd(name, unit) for name, unit in self._systemd_services]
        services.extend(self._container(name, container) for name, container in self._containers)
        return {
            "services": services,
            "allHealthy": bool(services) and all(service["ok"] for service in services),
        }


class NetworkStatusProvider:
    def __init__(
        self,
        run=subprocess.run,
        resolv_conf="/run/systemd/resolve/resolv.conf",
        ufw_conf="/etc/ufw/ufw.conf",
    ):
        self._run = run
        self._resolv_conf = pathlib.Path(resolv_conf)
        self._ufw_conf = pathlib.Path(ufw_conf)

    def _execute(self, argv):
        return self._run(
            argv,
            check=False,
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5,
        )

    def snapshot(self):
        route_result = self._execute([
            "/usr/sbin/ip", "-j", "-4", "route", "show", "default",
        ])
        if route_result.returncode != 0:
            raise ValueError("default route is unavailable")
        routes = json.loads(route_result.stdout)
        if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
            raise ValueError("default route is unavailable")
        route = routes[0]
        gateway = str(route.get("gateway", ""))
        interface = str(route.get("dev", ""))
        ipv4_address = str(route.get("prefsrc", ""))
        if not gateway or not interface:
            raise ValueError("default route is incomplete")

        dns_servers = []
        for line in self._resolv_conf.read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[0] == "nameserver":
                dns_servers.append(parts[1])

        ufw_lines = self._ufw_conf.read_text(encoding="utf-8").splitlines()
        firewall_active = any(line.strip() == "ENABLED=yes" for line in ufw_lines)
        return {
            "interface": interface,
            "ipv4Address": ipv4_address,
            "gateway": gateway,
            "dnsServers": dns_servers,
            "dnsUsesRouter": gateway in dns_servers,
            "firewallActive": firewall_active,
        }


class ThreadingUnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        socket_path,
        handler,
        token,
        executor,
        policy,
        status_provider,
        storage_provider=None,
        services_provider=None,
        network_provider=None,
    ):
        self.token = token
        self.executor = executor
        self.policy = policy
        self.status_provider = status_provider
        self.storage_provider = storage_provider
        self.services_provider = services_provider
        self.network_provider = network_provider
        super().__init__(socket_path, handler)


class RequestHandler(http.server.BaseHTTPRequestHandler):
    server_version = "JarvisActionBroker/1.0"

    def log_message(self, format_string, *args):
        sys.stderr.write("action-broker request completed\n")

    def _json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self):
        expected = "Bearer " + self.server.token
        supplied = self.headers.get("Authorization", "")
        return hmac.compare_digest(supplied, expected)

    def do_GET(self):
        providers = {
            "/v1/status": self.server.status_provider,
            "/v1/storage": self.server.storage_provider,
            "/v1/services": self.server.services_provider,
            "/v1/network": self.server.network_provider,
        }
        provider = providers.get(self.path)
        if provider is None:
            self._json(404, {"ok": False})
            return
        if not self._authorized():
            self._json(401, {"ok": False})
            return
        try:
            status = provider.snapshot()
        except (OSError, ValueError):
            self._json(503, {"ok": False})
            return
        self._json(200, status)

    def do_POST(self):
        if self.path != "/v1/restart":
            self._json(404, {"ok": False})
            return

        if not self._authorized():
            self._json(401, {"ok": False})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length < 2 or length > 4096:
            self._json(400, {"ok": False})
            return

        try:
            payload = json.loads(self.rfile.read(length))
            if set(payload) != {"service"}:
                raise PolicyError("unexpected fields")
            container = self.server.policy.container_for(payload["service"])
            self.server.executor.restart(container)
        except (json.JSONDecodeError, PolicyError):
            self._json(400, {"ok": False})
            return
        except (subprocess.SubprocessError, OSError):
            self._json(503, {"ok": False})
            return

        self._json(200, {"ok": True})


def _prepare_socket(socket_path):
    path = pathlib.Path(socket_path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    if path.exists() or path.is_socket():
        mode = path.lstat().st_mode
        if not stat.S_ISSOCK(mode):
            raise RuntimeError("refusing to replace a non-socket path")
        path.unlink()


def main():
    socket_path = os.environ.get("ACTION_BROKER_SOCKET", "/run/home-ai/action-broker.sock")
    token_file = os.environ.get("ACTION_BROKER_TOKEN_FILE", "/opt/home-ai/secrets/action_broker_token")
    token = pathlib.Path(token_file).read_text(encoding="utf-8").strip()
    if len(token) < 32:
        raise RuntimeError("action broker token is too short")

    _prepare_socket(socket_path)
    server = ThreadingUnixServer(
        socket_path,
        RequestHandler,
        token=token,
        executor=DockerExecutor(),
        policy=ActionPolicy(),
        status_provider=SystemStatusProvider(),
        storage_provider=StorageStatusProvider(),
        services_provider=ServiceStatusProvider(),
        network_provider=NetworkStatusProvider(),
    )
    os.chmod(socket_path, 0o660)
    server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    main()
