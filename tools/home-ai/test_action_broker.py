import importlib.util
import json
import os
import pathlib
import socket
import subprocess
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).with_name("action_broker.py")
SPEC = importlib.util.spec_from_file_location("action_broker", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ActionBrokerTest(unittest.TestCase):
    def test_authenticated_network_endpoint_returns_read_only_snapshot(self):
        expected = {
            "interface": "end0",
            "ipv4Address": "192.168.1.164",
            "gateway": "192.168.1.1",
            "dnsServers": ["192.168.1.1"],
            "dnsUsesRouter": True,
            "firewallActive": True,
        }
        with tempfile.TemporaryDirectory() as directory:
            socket_path = str(pathlib.Path(directory, "broker.sock"))
            provider = mock.Mock()
            provider.snapshot.return_value = expected
            server = MODULE.ThreadingUnixServer(
                socket_path,
                MODULE.RequestHandler,
                token="t" * 64,
                executor=mock.Mock(),
                policy=MODULE.ActionPolicy(),
                status_provider=mock.Mock(),
                storage_provider=mock.Mock(),
                services_provider=mock.Mock(),
                network_provider=provider,
            )
            thread = threading.Thread(target=server.handle_request, daemon=True)
            thread.start()
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.connect(socket_path)
            client.sendall(
                b"GET /v1/network HTTP/1.1\r\n"
                b"Host: localhost\r\n"
                + b"Authorization: Bearer " + (b"t" * 64) + b"\r\n"
                b"Connection: close\r\n\r\n"
            )
            response = b""
            while chunk := client.recv(4096):
                response += chunk
            client.close()
            thread.join(timeout=2)
            server.server_close()

        status_line, _headers, body = response.partition(b"\r\n\r\n")
        self.assertIn(b"200", status_line)
        self.assertEqual(json.loads(body), expected)

    def test_network_provider_reports_route_dns_and_firewall_with_fixed_commands(self):
        calls = []

        def fake_run(argv, **kwargs):
            calls.append((argv, kwargs))
            payload = [{
                "dst": "default",
                "gateway": "192.168.1.1",
                "dev": "end0",
                "prefsrc": "192.168.1.164",
            }]
            return subprocess.CompletedProcess(argv, 0, stdout=json.dumps(payload), stderr="")

        with tempfile.TemporaryDirectory() as directory:
            resolv_conf = pathlib.Path(directory, "resolv.conf")
            resolv_conf.write_text(
                "nameserver 192.168.1.1\nnameserver fd24:e392:1961::1\nsearch .\n",
                encoding="utf-8",
            )
            ufw_conf = pathlib.Path(directory, "ufw.conf")
            ufw_conf.write_text("# managed by ufw\nENABLED=yes\n", encoding="utf-8")
            provider = MODULE.NetworkStatusProvider(
                run=fake_run,
                resolv_conf=resolv_conf,
                ufw_conf=ufw_conf,
            )
            self.assertEqual(provider.snapshot(), {
                "interface": "end0",
                "ipv4Address": "192.168.1.164",
                "gateway": "192.168.1.1",
                "dnsServers": ["192.168.1.1", "fd24:e392:1961::1"],
                "dnsUsesRouter": True,
                "firewallActive": True,
            })

        self.assertEqual(calls[0][0], ["/usr/sbin/ip", "-j", "-4", "route", "show", "default"])
        self.assertEqual(len(calls), 1)
        self.assertTrue(all(call[1]["shell"] is False for call in calls))

    def test_authenticated_services_endpoint_returns_allowlisted_snapshot(self):
        expected = {"services": [{
            "name": "Docker", "kind": "systemd", "state": "active", "health": None, "ok": True,
        }], "allHealthy": True}
        with tempfile.TemporaryDirectory() as directory:
            socket_path = str(pathlib.Path(directory, "broker.sock"))
            provider = mock.Mock()
            provider.snapshot.return_value = expected
            server = MODULE.ThreadingUnixServer(
                socket_path,
                MODULE.RequestHandler,
                token="t" * 64,
                executor=mock.Mock(),
                policy=MODULE.ActionPolicy(),
                status_provider=mock.Mock(),
                storage_provider=mock.Mock(),
                services_provider=provider,
            )
            thread = threading.Thread(target=server.handle_request, daemon=True)
            thread.start()
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.connect(socket_path)
            client.sendall(
                b"GET /v1/services HTTP/1.1\r\n"
                b"Host: localhost\r\n"
                + b"Authorization: Bearer " + (b"t" * 64) + b"\r\n"
                b"Connection: close\r\n\r\n"
            )
            response = b""
            while chunk := client.recv(4096):
                response += chunk
            client.close()
            thread.join(timeout=2)
            server.server_close()

        status_line, _headers, body = response.partition(b"\r\n\r\n")
        self.assertIn(b"200", status_line)
        self.assertEqual(json.loads(body), expected)

    def test_service_provider_runs_only_fixed_read_only_checks(self):
        calls = []

        def fake_run(argv, **kwargs):
            calls.append((argv, kwargs))
            if argv[0] == "/usr/bin/systemctl":
                return subprocess.CompletedProcess(argv, 0, stdout="active\n", stderr="")
            states = {
                "samba": '{"Status":"running","Running":true,"Health":{"Status":"healthy"}}\n',
                "remnanode": '{"Status":"exited","Running":false}\n',
            }
            return subprocess.CompletedProcess(argv, 0, stdout=states[argv[-1]], stderr="")

        provider = MODULE.ServiceStatusProvider(
            run=fake_run,
            systemd_services=(("Docker", "docker.service"),),
            containers=(("Samba", "samba"), ("RemnaNode", "remnanode")),
        )

        self.assertEqual(provider.snapshot(), {
            "services": [
                {"name": "Docker", "kind": "systemd", "state": "active", "health": None, "ok": True},
                {"name": "Samba", "kind": "container", "state": "running", "health": "healthy", "ok": True},
                {"name": "RemnaNode", "kind": "container", "state": "exited", "health": None, "ok": False},
            ],
            "allHealthy": False,
        })
        self.assertEqual(calls[0][0], [
            "/usr/bin/systemctl", "show", "--property=ActiveState", "--value", "docker.service",
        ])
        self.assertEqual(calls[1][0], [
            "/usr/bin/docker", "inspect", "--format", "{{json .State}}", "samba",
        ])
        self.assertTrue(all(call[1]["shell"] is False for call in calls))
        self.assertTrue(all(call[1]["timeout"] == 5 for call in calls))

    def test_authenticated_storage_endpoint_returns_fixed_volume_snapshot(self):
        expected = {"volumes": [{
            "name": "SSD",
            "mountPoint": "/mnt/ssd",
            "totalBytes": 1000,
            "freeBytes": 600,
        }]}
        with tempfile.TemporaryDirectory() as directory:
            socket_path = str(pathlib.Path(directory, "broker.sock"))
            provider = mock.Mock()
            provider.snapshot.return_value = expected
            server = MODULE.ThreadingUnixServer(
                socket_path,
                MODULE.RequestHandler,
                token="t" * 64,
                executor=mock.Mock(),
                policy=MODULE.ActionPolicy(),
                status_provider=mock.Mock(),
                storage_provider=provider,
            )
            thread = threading.Thread(target=server.handle_request, daemon=True)
            thread.start()
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.connect(socket_path)
            client.sendall(
                b"GET /v1/storage HTTP/1.1\r\n"
                b"Host: localhost\r\n"
                + b"Authorization: Bearer " + (b"t" * 64) + b"\r\n"
                b"Connection: close\r\n\r\n"
            )
            response = b""
            while chunk := client.recv(4096):
                response += chunk
            client.close()
            thread.join(timeout=2)
            server.server_close()

        status_line, _headers, body = response.partition(b"\r\n\r\n")
        self.assertIn(b"200", status_line)
        self.assertEqual(json.loads(body), expected)

    def test_storage_provider_reports_only_the_fixed_home_node_volumes(self):
        sizes = {
            "/": (16_000, 6_000),
            "/mnt/ssd": (1_000_000, 600_000),
            "/mnt/hdd": (4_000_000, 2_500_000),
            "/var/log": (48_000, 40_000),
        }

        def fake_statvfs(mount_point):
            total, free = sizes[mount_point]
            return SimpleNamespace(f_blocks=total, f_bavail=free, f_frsize=1024)

        provider = MODULE.StorageStatusProvider(
            statvfs=fake_statvfs,
            is_mount=lambda path: path in sizes,
        )

        self.assertEqual(
            provider.snapshot(),
            {"volumes": [
                {"name": "Система", "mountPoint": "/", "totalBytes": 16_384_000, "freeBytes": 6_144_000},
                {"name": "SSD", "mountPoint": "/mnt/ssd", "totalBytes": 1_024_000_000, "freeBytes": 614_400_000},
                {"name": "HDD", "mountPoint": "/mnt/hdd", "totalBytes": 4_096_000_000, "freeBytes": 2_560_000_000},
                {"name": "Логи", "mountPoint": "/var/log", "totalBytes": 49_152_000, "freeBytes": 40_960_000},
            ]},
        )

    def test_authenticated_status_endpoint_returns_provider_snapshot(self):
        expected = {
            "memory": {"totalBytes": 100, "availableBytes": 40},
            "swap": {"totalBytes": 20, "freeBytes": 10},
            "disk": {"totalBytes": 1000, "freeBytes": 750},
            "temperatureCelsius": 43.5,
            "loadAverage": [0.1, 0.2, 0.3],
            "uptimeSeconds": 86400,
        }
        with tempfile.TemporaryDirectory() as directory:
            socket_path = str(pathlib.Path(directory, "broker.sock"))
            provider = mock.Mock()
            provider.snapshot.return_value = expected
            server = MODULE.ThreadingUnixServer(
                socket_path,
                MODULE.RequestHandler,
                token="t" * 64,
                executor=mock.Mock(),
                policy=MODULE.ActionPolicy(),
                status_provider=provider,
            )
            thread = threading.Thread(target=server.handle_request, daemon=True)
            thread.start()
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.connect(socket_path)
            client.sendall(
                b"GET /v1/status HTTP/1.1\r\n"
                b"Host: localhost\r\n"
                + b"Authorization: Bearer " + (b"t" * 64) + b"\r\n"
                b"Connection: close\r\n\r\n"
            )
            response = b""
            while chunk := client.recv(4096):
                response += chunk
            client.close()
            thread.join(timeout=2)
            server.server_close()

        status_line, _headers, body = response.partition(b"\r\n\r\n")
        self.assertIn(b"200", status_line)
        self.assertEqual(json.loads(body), expected)
        provider.snapshot.assert_called_once_with()

    def test_status_provider_reads_bounded_host_diagnostics_without_subprocesses(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            proc_root = root / "proc"
            thermal_root = root / "sys" / "class" / "thermal"
            proc_root.mkdir(parents=True)
            (thermal_root / "thermal_zone0").mkdir(parents=True)
            (thermal_root / "thermal_zone1").mkdir(parents=True)
            (proc_root / "meminfo").write_text(
                "MemTotal:        4000000 kB\n"
                "MemAvailable:    1750000 kB\n"
                "SwapTotal:       2000000 kB\n"
                "SwapFree:        1500000 kB\n",
                encoding="utf-8",
            )
            (proc_root / "loadavg").write_text("0.20 0.30 0.40 1/200 123\n", encoding="utf-8")
            (proc_root / "uptime").write_text("259200.50 100000.00\n", encoding="utf-8")
            (thermal_root / "thermal_zone0" / "temp").write_text("41000\n", encoding="utf-8")
            (thermal_root / "thermal_zone1" / "temp").write_text("42500\n", encoding="utf-8")

            provider = MODULE.SystemStatusProvider(
                proc_root=proc_root,
                thermal_root=thermal_root,
                disk_path="/",
                statvfs=lambda _path: SimpleNamespace(
                    f_blocks=1000,
                    f_bavail=400,
                    f_frsize=4096,
                ),
            )

            self.assertEqual(
                provider.snapshot(),
                {
                    "memory": {
                        "totalBytes": 4_096_000_000,
                        "availableBytes": 1_792_000_000,
                    },
                    "swap": {
                        "totalBytes": 2_048_000_000,
                        "freeBytes": 1_536_000_000,
                    },
                    "disk": {
                        "totalBytes": 4_096_000,
                        "freeBytes": 1_638_400,
                    },
                    "temperatureCelsius": 42.5,
                    "loadAverage": [0.2, 0.3, 0.4],
                    "uptimeSeconds": 259200.5,
                },
            )

    def test_policy_maps_only_approved_services_to_exact_container_names(self):
        policy = MODULE.ActionPolicy()
        self.assertEqual(policy.container_for("samba"), "samba")
        self.assertEqual(policy.container_for("qbittorrent"), "qbittorrent")
        self.assertEqual(policy.container_for("jellyfin"), "jellyfin")
        for denied in ("docker", "ssh", "remnanode", "dns", "firewall", "samba; id"):
            with self.assertRaises(MODULE.PolicyError):
                policy.container_for(denied)

    def test_executor_uses_a_fixed_argv_without_a_shell(self):
        calls = []

        def fake_run(argv, **kwargs):
            calls.append((argv, kwargs))

        executor = MODULE.DockerExecutor(run=fake_run, docker_binary="/usr/bin/docker")
        executor.restart("samba")
        self.assertEqual(calls[0][0], ["/usr/bin/docker", "restart", "samba"])
        self.assertFalse(calls[0][1]["shell"])
        self.assertEqual(calls[0][1]["timeout"], 60)

    def test_main_does_not_require_chown_capability(self):
        with tempfile.TemporaryDirectory() as directory:
            token_file = pathlib.Path(directory, "token")
            token_file.write_text("a" * 64, encoding="utf-8")
            server = mock.Mock()
            environment = {
                "ACTION_BROKER_SOCKET": str(pathlib.Path(directory, "broker.sock")),
                "ACTION_BROKER_TOKEN_FILE": str(token_file),
            }
            with (
                mock.patch.dict(os.environ, environment, clear=True),
                mock.patch.object(MODULE, "_prepare_socket"),
                mock.patch.object(MODULE, "ThreadingUnixServer", return_value=server),
                mock.patch.object(MODULE.os, "chown") as chown,
                mock.patch.object(MODULE.os, "chmod"),
            ):
                MODULE.main()

            chown.assert_not_called()
            server.serve_forever.assert_called_once_with(poll_interval=0.5)


if __name__ == "__main__":
    unittest.main()
