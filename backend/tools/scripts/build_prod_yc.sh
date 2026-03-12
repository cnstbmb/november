#!/usr/bin/env bash
set -euo pipefail

SCRIPTPATH="$(cd "$(dirname "$0")" >/dev/null 2>&1; pwd -P)"
ROOT_DIR="$(cd "$SCRIPTPATH/../.." >/dev/null 2>&1; pwd -P)"

if [ -z "${YC_REGISTRY_ID:-}" ]; then
  echo "YC_REGISTRY_ID is required"
  exit 1
fi

DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
TIMESTAMP="$(date +%s)"
IMAGE_NAME="cr.yandex/${YC_REGISTRY_ID}/nodejs-server"
TAG_NEW="${IMAGE_NAME}:${TIMESTAMP}"
TAG_LATEST="${IMAGE_NAME}:latest"

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required. Install Docker Buildx first."
  exit 1
fi

if ! docker buildx inspect >/dev/null 2>&1; then
  docker buildx create --name november-builder --use >/dev/null
fi

docker buildx inspect --bootstrap >/dev/null

echo "Building and pushing ${TAG_LATEST} and ${TAG_NEW} for platform(s): ${DOCKER_PLATFORM}"
cd "${ROOT_DIR}"
docker buildx build --no-cache \
  --platform "${DOCKER_PLATFORM}" \
  --tag "${TAG_LATEST}" \
  --tag "${TAG_NEW}" \
  --push \
  .

echo "Done: ${TAG_LATEST}, ${TAG_NEW}"
