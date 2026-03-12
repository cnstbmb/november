#!/usr/bin/env bash
set -euo pipefail

SCRIPTPATH="$(cd "$(dirname "$0")" >/dev/null 2>&1; pwd -P)"
ROOT_DIR="$(cd "$SCRIPTPATH/../.." >/dev/null 2>&1; pwd -P)"

SCRIPT_START_TIME="$(date +%s)"

echo "Build local Docker images for macOS (linux/arm64, no push)"

echo "Building backend image..."
cd "${ROOT_DIR}/backend"
npm run build:docker:local:mac

echo "Building frontend image..."
cd "${ROOT_DIR}/frontend"
npm run build:docker:local:mac

SCRIPT_END_TIME="$(date +%s)"
RUNTIME=$((SCRIPT_END_TIME - SCRIPT_START_TIME))
echo "Done in $((RUNTIME / 60))m $((RUNTIME % 60))s"
