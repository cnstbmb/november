#!/bin/sh
set -eu

UFW_RSYSLOG_CONFIG=/etc/rsyslog.d/20-ufw.conf
JOURNAL_DROPIN_DIR=/etc/systemd/journald.conf.d
JOURNAL_DROPIN="${JOURNAL_DROPIN_DIR}/20-home-node-rate-limit.conf"
BACKUP_DIR=/var/backups/home-node-log-pipeline

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root." >&2
  exit 1
fi

test -f "${UFW_RSYSLOG_CONFIG}"
mkdir -p "${BACKUP_DIR}" "${JOURNAL_DROPIN_DIR}"

if [ ! -f "${BACKUP_DIR}/20-ufw.conf.before-home-node-hardening" ]; then
  install -m 0644 "${UFW_RSYSLOG_CONFIG}" \
    "${BACKUP_DIR}/20-ufw.conf.before-home-node-hardening"
fi

if [ -f "${JOURNAL_DROPIN}" ] \
  && [ ! -f "${BACKUP_DIR}/20-home-node-rate-limit.conf.previous" ]; then
  install -m 0644 "${JOURNAL_DROPIN}" \
    "${BACKUP_DIR}/20-home-node-rate-limit.conf.previous"
fi

# Keep UFW events in ufw.log without duplicating them into kern.log/syslog.
python3 - "${UFW_RSYSLOG_CONFIG}" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
commented = '#& stop'
enabled = '& stop'

if commented in text:
    path.write_text(text.replace(commented, enabled, 1))
elif enabled not in text:
    raise SystemExit(f"Expected UFW stop rule was not found in {path}")
PY

cat >"${JOURNAL_DROPIN}.tmp" <<'EOF'
[Journal]
RateLimitIntervalSec=30s
RateLimitBurst=500
RuntimeMaxUse=20M
EOF
install -m 0644 "${JOURNAL_DROPIN}.tmp" "${JOURNAL_DROPIN}"
rm -f "${JOURNAL_DROPIN}.tmp"

rsyslogd -N1
systemctl restart systemd-journald
systemctl restart rsyslog

sleep 3

echo "== effective journal protection =="
systemd-analyze cat-config systemd/journald.conf \
  | tail -n 20

echo "== effective UFW rsyslog rule =="
sed -n '1,30p' "${UFW_RSYSLOG_CONFIG}"

echo "== live logging CPU =="
top -b -n 2 -d 2 -p "$(pidof systemd-journald),$(pidof rsyslogd)" \
  | tail -n 20

echo "== log filesystem =="
df -h /var/log

echo "Log-pipeline protection applied. Backups: ${BACKUP_DIR}"
