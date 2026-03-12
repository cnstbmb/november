#!/usr/bin/env bash
set -euo pipefail

SCRIPTPATH="$(cd "$(dirname "$0")" >/dev/null 2>&1; pwd -P)"
ROOT_DIR="$(cd "$SCRIPTPATH/../.." >/dev/null 2>&1; pwd -P)"

if [ -z "${YC_REGISTRY_ID:-}" ]; then
  echo "YC_REGISTRY_ID is required"
  exit 1
fi

SCRIPT_START_TIME="$(date +%s)"
echo "Start production Docker build (Yandex Container Registry)"

echo "Build backend image"
BUILD_BACKEND_START_TIME="$(date +%s)"
cd "${ROOT_DIR}/backend"
npm run build:docker:prod:yc
BUILD_BACKEND_END_TIME="$(date +%s)"
BUILD_BACKEND_TIME=$((BUILD_BACKEND_END_TIME - BUILD_BACKEND_START_TIME))
echo "Backend done in $((BUILD_BACKEND_TIME / 60))m $((BUILD_BACKEND_TIME % 60))s"

echo "Build frontend image"
BUILD_FRONTEND_START_TIME="$(date +%s)"
cd "${ROOT_DIR}/frontend"
npm run build:docker:prod:yc
BUILD_FRONTEND_END_TIME="$(date +%s)"
BUILD_FRONTEND_TIME=$((BUILD_FRONTEND_END_TIME - BUILD_FRONTEND_START_TIME))
echo "Frontend done in $((BUILD_FRONTEND_TIME / 60))m $((BUILD_FRONTEND_TIME % 60))s"

SCRIPT_END_TIME="$(date +%s)"
RUNTIME=$((SCRIPT_END_TIME - SCRIPT_START_TIME))
echo "Done in $((RUNTIME / 60))m $((RUNTIME % 60))s"
