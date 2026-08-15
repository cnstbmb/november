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
