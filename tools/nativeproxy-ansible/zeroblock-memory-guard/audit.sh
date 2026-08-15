#!/bin/sh
set -u

failed=0

fail() {
	printf 'FAIL %s\n' "$1"
	failed=1
}

pass() {
	printf 'PASS %s\n' "$1"
}

[ -x /usr/bin/sing-box ] && [ "$(wc -c </usr/bin/sing-box)" -gt 1000000 ] \
	&& pass 'stock sing-box binary installed' \
	|| fail 'stock sing-box binary is unavailable'

/etc/init.d/zeroblock enabled \
	&& pass 'zeroblock autostart enabled' \
	|| fail 'zeroblock autostart disabled'

/etc/init.d/zeroblock-memory-watchdog enabled \
	&& pass 'memory watchdog autostart enabled' \
	|| fail 'memory watchdog autostart disabled'

/etc/init.d/prometheus-node-exporter-lua enabled \
	&& pass 'prometheus-node-exporter-lua enabled' \
	|| fail 'prometheus-node-exporter-lua disabled'

metrics_file=/tmp/prometheus/zeroblock.prom
if [ -r "$metrics_file" ] \
	&& grep -q '^zeroblock_rss_bytes [0-9][0-9]*$' "$metrics_file" \
	&& grep -q '^zeroblock_swap_bytes [0-9][0-9]*$' "$metrics_file"; then
	pass 'Zeroblock Prometheus metrics available in tmpfs'
else
	fail 'Zeroblock Prometheus metrics missing or invalid'
fi

pid="$(pidof sing-box 2>/dev/null)"
if [ -z "$pid" ]; then
	fail 'sing-box is not running'
else
	pass 'sing-box is running'
	rss_kb=0
	proc_swap_kb=0
	for item in $pid; do
		value="$(awk '$1 == "VmRSS:" { print $2 }' "/proc/$item/status")"
		rss_kb=$((rss_kb + ${value:-0}))
		value="$(awk '$1 == "VmSwap:" { print $2 }' "/proc/$item/status")"
		proc_swap_kb=$((proc_swap_kb + ${value:-0}))
	done
	[ "$rss_kb" -lt 184320 ] \
		&& pass "sing-box RSS is ${rss_kb}kB" \
		|| fail "sing-box RSS is ${rss_kb}kB"
	[ "$proc_swap_kb" -lt 32768 ] \
		&& pass "sing-box swap is ${proc_swap_kb}kB" \
		|| fail "sing-box swap is ${proc_swap_kb}kB"
fi

available_kb="$(awk '$1 == "MemAvailable:" { print $2 }' /proc/meminfo)"
[ "$available_kb" -ge 131072 ] \
	&& pass "router has ${available_kb}kB available" \
	|| fail "router has only ${available_kb}kB available"

ps w | grep -q '[z]eroblock-memory-watchdog' \
	&& pass 'memory watchdog is running' \
	|| fail 'memory watchdog is not running'

status="$(cat /tmp/zeroblock-memory-watchdog.status 2>/dev/null || true)"
printf 'INFO watchdog_status=%s\n' "${status:-unknown}"

exit "$failed"
