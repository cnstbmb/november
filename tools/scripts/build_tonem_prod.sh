#!/usr/bin/env bash
set -euo pipefail

SCRIPTPATH="$(cd "$(dirname "$0")" >/dev/null 2>&1; pwd -P)"
ROOT_DIR="$(cd "$SCRIPTPATH/../.." >/dev/null 2>&1; pwd -P)"

DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64,linux/arm64}"

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required. Install Docker Buildx first."
  exit 1
fi

if ! docker buildx inspect >/dev/null 2>&1; then
  docker buildx create --name november-builder --use >/dev/null
fi

docker buildx inspect --bootstrap >/dev/null

SCRIPT_START_TIME="$(date +%s)"
echo "=== Build tonem-server ==="
cd "${ROOT_DIR}"
docker buildx build --no-cache \
  --platform "${DOCKER_PLATFORM}" \
  --tag "cnstbmb/tonem-server:latest" \
  --push \
  -f apps/tonem-server/Dockerfile \
  .

echo "=== Build tonem-web ==="
docker buildx build --no-cache \
  --platform "${DOCKER_PLATFORM}" \
  --tag "cnstbmb/tonem-web:latest" \
  --push \
  -f deployments/tonem/Dockerfile.frontend \
  .

SCRIPT_END_TIME="$(date +%s)"
RUNTIME=$((SCRIPT_END_TIME - SCRIPT_START_TIME))
echo "Tonem images built and pushed in $((RUNTIME / 60))m $((RUNTIME % 60))s"
