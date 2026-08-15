#!/bin/sh
set -u

STATUS=/tmp/zeroblock-memory-watchdog.status
INTERVAL_SECONDS=5
RSS_RESTART_KB=184320
SWAP_RESTART_KB=32768
AVAILABLE_MIN_KB=131072
PRESSURE_SAMPLES_REQUIRED=3
STARTUP_GRACE_SECONDS=120
RESTART_WINDOW_SECONDS=900
RESTARTS_BEFORE_PAUSE=3
PAUSE_SECONDS=1800

uptime_seconds() {
	cut -d. -f1 /proc/uptime
}

stock_binary_is_safe() {
	[ -x /usr/bin/sing-box ] || return 1
	[ "$(wc -c </usr/bin/sing-box)" -gt 1000000 ]
}

stop_for_integrity_failure() {
	printf 'blocked:stock-sing-box-missing\n' >"$STATUS"
	logger -t zeroblock-memory-guard "Stopping Zeroblock: stock sing-box binary is unavailable"
	/etc/init.d/zeroblock stop
}

restart_count=0
window_started="$(uptime_seconds)"
pressure_samples=0
last_pids=
startup_until=0
printf 'idle:no-sing-box\n' >"$STATUS"

while true; do
	if ! stock_binary_is_safe; then
		stop_for_integrity_failure
		sleep "$INTERVAL_SECONDS"
		continue
	fi

	pids="$(pidof sing-box 2>/dev/null)"
	if [ -z "$pids" ]; then
		pressure_samples=0
		last_pids=
		startup_until=0
		printf 'idle:no-sing-box\n' >"$STATUS"
		sleep "$INTERVAL_SECONDS"
		continue
	fi

	now="$(uptime_seconds)"
	if [ "$pids" != "$last_pids" ]; then
		last_pids="$pids"
		startup_until=$((now + STARTUP_GRACE_SECONDS))
		pressure_samples=0
	fi

	rss_kb=0
	proc_swap_kb=0
	for pid in $pids; do
		[ -r "/proc/$pid/status" ] || continue
		value="$(awk '$1 == "VmRSS:" { print $2 }' "/proc/$pid/status")"
		rss_kb=$((rss_kb + ${value:-0}))
		value="$(awk '$1 == "VmSwap:" { print $2 }' "/proc/$pid/status")"
		proc_swap_kb=$((proc_swap_kb + ${value:-0}))
	done
	available_kb="$(awk '$1 == "MemAvailable:" { print $2 }' /proc/meminfo)"
	reason=

	if [ "$proc_swap_kb" -ge "$SWAP_RESTART_KB" ]; then
		pressure_samples=$((pressure_samples + 1))
	elif [ "$now" -lt "$startup_until" ]; then
		pressure_samples=0
	elif [ "$rss_kb" -ge "$RSS_RESTART_KB" ]; then
		pressure_samples=$((pressure_samples + 1))
	elif [ "$available_kb" -lt "$AVAILABLE_MIN_KB" ]; then
		pressure_samples=$((pressure_samples + 1))
	else
		pressure_samples=0
	fi

	if [ "$pressure_samples" -ge "$PRESSURE_SAMPLES_REQUIRED" ]; then
		reason="pressure:rss_kb=$rss_kb,swap_kb=$proc_swap_kb,available_kb=$available_kb"
	fi

	if [ -z "$reason" ]; then
		phase=healthy
		[ "$now" -lt "$startup_until" ] && phase=startup
		printf '%s:rss_kb=%s,swap_kb=%s,available_kb=%s\n' \
			"$phase" "$rss_kb" "$proc_swap_kb" "$available_kb" >"$STATUS"
		sleep "$INTERVAL_SECONDS"
		continue
	fi

	if [ $((now - window_started)) -gt "$RESTART_WINDOW_SECONDS" ]; then
		window_started="$now"
		restart_count=0
	fi
	pressure_samples=0

	if [ "$restart_count" -ge "$RESTARTS_BEFORE_PAUSE" ]; then
		printf 'paused:%s\n' "$reason" >"$STATUS"
		logger -t zeroblock-memory-guard "Pausing Zeroblock for ${PAUSE_SECONDS}s after repeated pressure: $reason"
		/etc/init.d/zeroblock stop
		sleep "$PAUSE_SECONDS"
		restart_count=0
		window_started="$(uptime_seconds)"
		if /etc/init.d/zeroblock enabled; then
			/etc/init.d/zeroblock start
		fi
		continue
	fi

	restart_count=$((restart_count + 1))
	printf 'restarting:%s,count=%s\n' "$reason" "$restart_count" >"$STATUS"
	logger -t zeroblock-memory-guard "Restarting Zeroblock after memory pressure ($restart_count/$RESTARTS_BEFORE_PAUSE): $reason"
	/etc/init.d/zeroblock restart
	sleep 60
done
