# Zeroblock memory guard

Read-only RSS/swap watchdog for Zeroblock on the RouteRich OpenWrt router.

The RouteRich procd/cgroup integration does not safely support external memory
controller changes. This guard therefore leaves the package binary and cgroup
hierarchy untouched and monitors the actual `sing-box` values from `/proc`.

After a 120-second startup grace, three consecutive five-second samples trigger
a Zeroblock restart when any of these conditions persists:

- sing-box RSS is at least 180 MiB;
- sing-box swap is at least 32 MiB;
- router `MemAvailable` is below 128 MiB.

After three restarts within 15 minutes, Zeroblock is stopped for 30 minutes so
the router and ordinary internet access remain available. Status is written to
`/tmp/zeroblock-memory-watchdog.status`; run
`/usr/libexec/zeroblock-memory-audit` for the red/green health check.

## Prometheus and Grafana

The watchdog also writes an atomic Prometheus textfile snapshot to
`/tmp/prometheus/zeroblock.prom`. It contains router available memory,
aggregate Zeroblock RSS and process swap, pressure/restart counters, and a
bounded watchdog state.

`install-monitoring.sh` installs the lightweight OpenWrt Lua node exporter,
hardware/thermal and textfile collectors, the watchdog bundle, and a firewall
rule restricted to the Prometheus server's WireGuard address. It never binds
the exporter to every interface and refuses to put the five-second metrics
file on persistent flash.

Run a read-only preflight on the router first:

```sh
OPENWRT_PROMETHEUS_INTERFACE='<uci-wireguard-network>' \
OPENWRT_PROMETHEUS_FIREWALL_ZONE='<wireguard-firewall-zone>' \
OPENWRT_PROMETHEUS_SOURCE_CIDR='<master-wireguard-ip>/32' \
./install-monitoring.sh
```

Apply only after the printed interface, zone and source address are correct:

```sh
OPENWRT_PROMETHEUS_INTERFACE='<uci-wireguard-network>' \
OPENWRT_PROMETHEUS_FIREWALL_ZONE='<wireguard-firewall-zone>' \
OPENWRT_PROMETHEUS_SOURCE_CIDR='<master-wireguard-ip>/32' \
./install-monitoring.sh --apply
```

The exporter listens on port `9100` of the selected WireGuard interface. Do
not use `*` or a WAN-facing UCI network.

On the monitoring master, private inventory should select the same display
name for the scrape target and dashboard:

```yaml
monitoring_router_targets:
  - host: routerich
    target: "<router-wireguard-ip>:9100"
monitoring_router_name: routerich
monitoring_router_alerting_enabled: true
monitoring_router_route_enabled: true
monitoring_router_route_interface: "<master-wireguard-interface>"
monitoring_router_route_destination: "<router-wireguard-ip>/32"
```

The optional route settings provision a small systemd oneshot on the monitoring
master. This is required when the WireGuard interface deliberately uses
`Table = off`: Prometheus then gets only the router `/32` route, while the
existing default route and Xray-bound traffic remain unchanged.
