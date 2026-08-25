#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
WORK_DIR="${HOME_AI_CONVERT_DIR:-${REPO_ROOT}/.private/ansible/prod/artifacts/home-ai/build-qwen3.5-2b}"
MODEL_REVISION="15852e8c16360a2fea060d615a32b45270f8a8fc"
IMAGE="november/rkllm-converter:1.3.0"
QUANT_ALGORITHM="${HOME_AI_QUANT_ALGORITHM:-grq}"
OUTPUT_NAME="qwen3.5-2b-w4a16-${QUANT_ALGORITHM}-rk3576.rkllm"
CONVERTER_MEMORY="${HOME_AI_CONVERTER_MEMORY:-29g}"
CONVERTER_CPUS="${HOME_AI_CONVERTER_CPUS:-10}"
MIN_DOCKER_MEMORY_BYTES=$((31 * 1024 * 1024 * 1024))

docker_memory_bytes="$(docker info --format '{{.MemTotal}}')"
if (( docker_memory_bytes < MIN_DOCKER_MEMORY_BYTES )); then
  docker_memory_gib="$((docker_memory_bytes / 1024 / 1024 / 1024))"
  echo "Docker Desktop exposes only ${docker_memory_gib} GiB; Qwen3.5-2B GRQ conversion requires at least 31 GiB." >&2
  echo "Set Docker Desktop -> Settings -> Resources -> Advanced -> Memory to 32 GB, then Apply & Restart." >&2
  exit 1
fi

mkdir -p "${WORK_DIR}/model" "${WORK_DIR}/output"

docker build \
  --platform linux/amd64 \
  --tag "${IMAGE}" \
  --file "${SCRIPT_DIR}/convert.Dockerfile" \
  "${SCRIPT_DIR}"

download_complete=false
for attempt in 1 2 3 4 5; do
  if docker run --rm --platform linux/amd64 \
    --entrypoint python \
    -e HF_HUB_DISABLE_XET=1 \
    -v "${WORK_DIR}/model:/model" \
    "${IMAGE}" \
    -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='Qwen/Qwen3.5-2B', revision='${MODEL_REVISION}', local_dir='/model')"; then
    download_complete=true
    break
  fi
  echo "Model download attempt ${attempt}/5 failed; resuming partial files..." >&2
done

if [[ "${download_complete}" != "true" ]]; then
  echo "Model download failed after 5 resumable attempts." >&2
  exit 1
fi

docker run --rm --platform linux/amd64 \
  --memory "${CONVERTER_MEMORY}" \
  --cpus "${CONVERTER_CPUS}" \
  -v "${WORK_DIR}/model:/model:ro" \
  -v "${WORK_DIR}/output:/output" \
  -v "${SCRIPT_DIR}/data_quant_qwen35.json:/data_quant.json:ro" \
  "${IMAGE}" \
  --model /model \
  --dataset /data_quant.json \
  --output "/output/${OUTPUT_NAME}" \
  --max-context 2048 \
  --algorithm "${QUANT_ALGORITHM}"

shasum -a 256 "${WORK_DIR}/output/${OUTPUT_NAME}"
