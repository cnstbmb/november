#!/usr/bin/env sh
set -eu

HOST="${1:-cnstbmb@95.31.244.3}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REMOTE_DIR="/tmp/nativeproxy-cleanup"
REMOTE_SCRIPT="$REMOTE_DIR/cleanup_home_remnawave_remote.sh"

ssh "$HOST" "mkdir -p '$REMOTE_DIR'"
scp "$SCRIPT_DIR/cleanup_home_remnawave_remote.sh" "$HOST:$REMOTE_SCRIPT"
ssh "$HOST" "chmod 0700 '$REMOTE_SCRIPT'"
ssh "$HOST" "sudo -S -p '' sh '$REMOTE_SCRIPT'"
