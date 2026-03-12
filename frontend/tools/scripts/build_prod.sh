#!/usr/bin/env bash
set -euo pipefail

SCRIPTPATH="$(cd "$(dirname "$0")" >/dev/null 2>&1; pwd -P)"
ROOT_DIR="$(cd "$SCRIPTPATH/../.." >/dev/null 2>&1; pwd -P)"

IMAGE_NAME="${IMAGE_NAME:-cnstbmb/khimenkov-angular-app}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required. Install Docker Buildx first."
  exit 1
fi

if ! docker buildx inspect >/dev/null 2>&1; then
  docker buildx create --name november-builder --use >/dev/null
fi

docker buildx inspect --bootstrap >/dev/null

echo "Building and pushing ${IMAGE_NAME}:latest for platform(s): ${DOCKER_PLATFORM}"
cd "${ROOT_DIR}"
docker buildx build --no-cache \
  --platform "${DOCKER_PLATFORM}" \
  --tag "${IMAGE_NAME}:latest" \
  --push \
  .

echo "Done: ${IMAGE_NAME}:latest"
