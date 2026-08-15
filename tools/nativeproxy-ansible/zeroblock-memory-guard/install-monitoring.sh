#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APPLY=false
PROMETHEUS_PORT="${OPENWRT_PROMETHEUS_PORT:-9100}"
PROMETHEUS_INTERFACE="${OPENWRT_PROMETHEUS_INTERFACE:-}"
PROMETHEUS_FIREWALL_ZONE="${OPENWRT_PROMETHEUS_FIREWALL_ZONE:-}"
PROMETHEUS_SOURCE_CIDR="${OPENWRT_PROMETHEUS_SOURCE_CIDR:-}"

case "${1:-}" in
	"") ;;
	--apply) APPLY=true ;;
	*)
		printf 'Usage: OPENWRT_PROMETHEUS_INTERFACE=<uci-network> OPENWRT_PROMETHEUS_FIREWALL_ZONE=<zone> OPENWRT_PROMETHEUS_SOURCE_CIDR=<master-wg-cidr> %s [--apply]\n' "$0" >&2
		exit 2
		;;
esac

if [ -z "$PROMETHEUS_INTERFACE" ] || [ -z "$PROMETHEUS_FIREWALL_ZONE" ] || [ -z "$PROMETHEUS_SOURCE_CIDR" ]; then
	printf 'Set OPENWRT_PROMETHEUS_INTERFACE, OPENWRT_PROMETHEUS_FIREWALL_ZONE and OPENWRT_PROMETHEUS_SOURCE_CIDR.\n' >&2
	exit 2
fi

case "$PROMETHEUS_INTERFACE" in
	'*')
		printf 'Refusing wildcard Prometheus binding. Select one private UCI network interface.\n' >&2
		exit 2
		;;
	''|*[!a-zA-Z0-9_.-]*)
		printf 'Invalid UCI network interface name: %s\n' "$PROMETHEUS_INTERFACE" >&2
		exit 2
		;;
esac

case "$PROMETHEUS_FIREWALL_ZONE" in
	''|*[!a-zA-Z0-9_.-]*)
		printf 'Invalid firewall zone name: %s\n' "$PROMETHEUS_FIREWALL_ZONE" >&2
		exit 2
		;;
esac

source_ip="${PROMETHEUS_SOURCE_CIDR%/32}"
if [ "$PROMETHEUS_SOURCE_CIDR" = "$source_ip" ] || ! printf '%s\n' "$source_ip" | awk -F. '
	NF != 4 { exit 1 }
	{ for (i = 1; i <= 4; i++) if ($i !~ /^[0-9]+$/ || $i > 255) exit 1 }
'; then
	printf 'OPENWRT_PROMETHEUS_SOURCE_CIDR must be one IPv4 /32.\n' >&2
	exit 2
fi

case "$PROMETHEUS_PORT" in
	''|*[!0-9]*)
		printf 'OPENWRT_PROMETHEUS_PORT must be numeric.\n' >&2
		exit 2
		;;
esac
if [ "$PROMETHEUS_PORT" -lt 1 ] || [ "$PROMETHEUS_PORT" -gt 65535 ]; then
	printf 'OPENWRT_PROMETHEUS_PORT must be between 1 and 65535.\n' >&2
	exit 2
fi

for source_file in zeroblock-memory-watchdog.sh zeroblock-memory-watchdog.init audit.sh; do
	if [ ! -f "$SCRIPT_DIR/$source_file" ]; then
		printf 'Missing bundle file: %s\n' "$SCRIPT_DIR/$source_file" >&2
		exit 1
	fi
done

if command -v apk >/dev/null 2>&1; then
	PACKAGE_MANAGER=apk
elif command -v opkg >/dev/null 2>&1; then
	PACKAGE_MANAGER=opkg
else
	printf 'Neither apk nor opkg is available; this script must run on OpenWrt.\n' >&2
	exit 1
fi

if [ "$(uci -q get "network.$PROMETHEUS_INTERFACE" 2>/dev/null || true)" != interface ]; then
	printf 'Unknown UCI network interface: %s\n' "$PROMETHEUS_INTERFACE" >&2
	exit 1
fi

firewall_zone_section="$(
	uci show firewall 2>/dev/null \
		| sed -n "s/^\([^=]*\)\.name='$PROMETHEUS_FIREWALL_ZONE'$/\1/p" \
		| head -n 1
)"
if [ -z "$firewall_zone_section" ]; then
	printf 'Unknown firewall zone: %s\n' "$PROMETHEUS_FIREWALL_ZONE" >&2
	exit 1
fi
firewall_zone_networks="$(uci -q get "$firewall_zone_section.network" 2>/dev/null || true)"
case " $firewall_zone_networks " in
	*" $PROMETHEUS_INTERFACE "*) ;;
	*)
		printf 'Firewall zone %s does not include network interface %s.\n' "$PROMETHEUS_FIREWALL_ZONE" "$PROMETHEUS_INTERFACE" >&2
		exit 1
		;;
esac

PACKAGES="prometheus-node-exporter-lua prometheus-node-exporter-lua-openwrt prometheus-node-exporter-lua-hwmon prometheus-node-exporter-lua-thermal prometheus-node-exporter-lua-textfile"

MODE=check
[ "$APPLY" = true ] && MODE=apply
printf 'mode=%s\n' "$MODE"
printf 'package_manager=%s\n' "$PACKAGE_MANAGER"
printf 'listen_interface=%s\n' "$PROMETHEUS_INTERFACE"
printf 'listen_port=%s\n' "$PROMETHEUS_PORT"
printf 'firewall_zone=%s\n' "$PROMETHEUS_FIREWALL_ZONE"
printf 'allowed_source=%s\n' "$PROMETHEUS_SOURCE_CIDR"
printf 'metrics_path=/tmp/prometheus/zeroblock.prom\n'

if [ "$APPLY" != true ]; then
	printf 'CHECK ONLY: rerun with --apply to install packages and services.\n'
	exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
	printf 'Apply mode must run as root on the router.\n' >&2
	exit 1
fi

mkdir -p /tmp/prometheus
metrics_target="$(readlink -f /var/prometheus 2>/dev/null || true)"
if [ "$metrics_target" != /tmp/prometheus ]; then
	if [ -e /var/prometheus ] || [ -L /var/prometheus ]; then
		printf '/var/prometheus exists outside tmpfs (%s); refusing five-second flash writes.\n' "${metrics_target:-unknown}" >&2
		exit 1
	fi
	ln -s /tmp/prometheus /var/prometheus
fi

if [ "$PACKAGE_MANAGER" = apk ]; then
	apk update
	apk add $PACKAGES
else
	opkg update
	opkg install $PACKAGES
fi

backup_dir="/root/zeroblock-monitoring-backup-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
for installed_file in \
	/usr/libexec/zeroblock-memory-watchdog \
	/usr/libexec/zeroblock-memory-audit \
	/etc/init.d/zeroblock-memory-watchdog; do
	if [ -e "$installed_file" ]; then
		cp -p "$installed_file" "$backup_dir/"
	fi
done

uci export prometheus-node-exporter-lua >"$backup_dir/prometheus-node-exporter-lua.uci" 2>/dev/null || true
uci show firewall.prometheus_router_monitoring >"$backup_dir/prometheus-firewall-rule.uci" 2>/dev/null || true

cp "$SCRIPT_DIR/zeroblock-memory-watchdog.sh" /usr/libexec/zeroblock-memory-watchdog
cp "$SCRIPT_DIR/audit.sh" /usr/libexec/zeroblock-memory-audit
cp "$SCRIPT_DIR/zeroblock-memory-watchdog.init" /etc/init.d/zeroblock-memory-watchdog
chmod 0755 \
	/usr/libexec/zeroblock-memory-watchdog \
	/usr/libexec/zeroblock-memory-audit \
	/etc/init.d/zeroblock-memory-watchdog

uci set prometheus-node-exporter-lua.main.listen_interface="$PROMETHEUS_INTERFACE"
uci set prometheus-node-exporter-lua.main.listen_port="$PROMETHEUS_PORT"
uci commit prometheus-node-exporter-lua

uci -q delete firewall.prometheus_router_monitoring || true
uci set firewall.prometheus_router_monitoring=rule
uci set firewall.prometheus_router_monitoring.name='Allow-Prometheus-from-master-WG'
uci set firewall.prometheus_router_monitoring.src="$PROMETHEUS_FIREWALL_ZONE"
uci set firewall.prometheus_router_monitoring.src_ip="$PROMETHEUS_SOURCE_CIDR"
uci set firewall.prometheus_router_monitoring.proto='tcp'
uci set firewall.prometheus_router_monitoring.dest_port="$PROMETHEUS_PORT"
uci set firewall.prometheus_router_monitoring.target='ACCEPT'
uci commit firewall

/etc/init.d/firewall reload
/etc/init.d/prometheus-node-exporter-lua enable
/etc/init.d/prometheus-node-exporter-lua restart
/etc/init.d/zeroblock-memory-watchdog enable
/etc/init.d/zeroblock-memory-watchdog restart

/usr/libexec/zeroblock-memory-audit
printf 'Previous watchdog files: %s\n' "$backup_dir"
printf 'Installed. Verify http://<router-WireGuard-IP>:%s/metrics from the Prometheus host.\n' "$PROMETHEUS_PORT"
