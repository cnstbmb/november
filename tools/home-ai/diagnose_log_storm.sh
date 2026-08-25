#!/bin/sh
set -eu

REPORT_PATH="${1:-/home/cnstbmb/log-storm-report.txt}"
REPORT_OWNER="${REPORT_OWNER:-cnstbmb}"
REPORT_GROUP="${REPORT_GROUP:-cnstbmb}"
TMP_REPORT="$(mktemp)"

cleanup() {
  rm -f "${TMP_REPORT}"
}
trap cleanup EXIT INT TERM

{
  echo "== captured at =="
  date --iso-8601=seconds

  echo "== uptime and memory =="
  uptime
  free -h

  echo "== journal disk usage =="
  journalctl --disk-usage

  echo "== messages by identifier, last 5 minutes =="
  journalctl --since "5 minutes ago" -o json --no-pager \
    | jq -r '.SYSLOG_IDENTIFIER // ._COMM // ._SYSTEMD_UNIT // "unknown"' \
    | sort \
    | uniq -c \
    | sort -nr \
    | head -n 30

  echo "== messages by unit, last 5 minutes =="
  journalctl --since "5 minutes ago" -o json --no-pager \
    | jq -r '._SYSTEMD_UNIT // "no-unit"' \
    | sort \
    | uniq -c \
    | sort -nr \
    | head -n 30

  echo "== repeated message bodies, last 60 seconds =="
  journalctl --since "60 seconds ago" -o json --no-pager \
    | jq -r '.MESSAGE // "no-message"' \
    | sort \
    | uniq -c \
    | sort -nr \
    | head -n 40

  echo "== recent journal sample =="
  journalctl --since "15 seconds ago" --no-pager -o short-iso \
    | tail -n 200

  echo "== logging process status =="
  ps -C systemd-journald -C rsyslogd -o pid,comm,%cpu,%mem,etime,time,args

  echo "== rsyslog service status =="
  systemctl status rsyslog --no-pager -l || true

  echo "== rsyslog configuration =="
  find /etc/rsyslog.conf /etc/rsyslog.d -maxdepth 2 -type f -print \
    -exec sed -n '1,240p' '{}' \; 2>/dev/null || true

  echo "== journal configuration =="
  systemd-analyze cat-config systemd/journald.conf || true
} >"${TMP_REPORT}" 2>&1

install -o "${REPORT_OWNER}" -g "${REPORT_GROUP}" -m 0600 \
  "${TMP_REPORT}" "${REPORT_PATH}"

echo "Diagnostic report written to ${REPORT_PATH}"
