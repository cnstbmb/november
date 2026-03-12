#!/usr/bin/env bash
set -euo pipefail

SCRIPTPATH="$(cd "$(dirname "$0")" >/dev/null 2>&1; pwd -P)"
ROOT_DIR="$(cd "$SCRIPTPATH/../.." >/dev/null 2>&1; pwd -P)"

IMAGE_NAME="${IMAGE_NAME:-cnstbmb/khimenkov-angular-app}"
LOCAL_DOCKER_PLATFORM="${LOCAL_DOCKER_PLATFORM:-linux/arm64}"

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required. Install Docker Buildx first."
  exit 1
fi

if ! docker buildx inspect >/dev/null 2>&1; then
  docker buildx create --name november-builder --use >/dev/null
fi

docker buildx inspect --bootstrap >/dev/null

echo "Building local image ${IMAGE_NAME}:latest for platform: ${LOCAL_DOCKER_PLATFORM}"
cd "${ROOT_DIR}"
docker buildx build --no-cache \
  --platform "${LOCAL_DOCKER_PLATFORM}" \
  --tag "${IMAGE_NAME}:latest" \
  --load \
  .

echo "Done: loaded local image ${IMAGE_NAME}:latest"
