#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${HOME_AI_CONVERT_DIR:-${SCRIPT_DIR}/.work}"
MODEL_REVISION="c1899de289a04d12100db370d81485cdf75e47ca"
IMAGE="november/rkllm-converter:1.3.0"
OUTPUT_NAME="qwen3-0.6b-w4a16-rk3576.rkllm"
QUANT_ALGORITHM="${HOME_AI_QUANT_ALGORITHM:-normal}"

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
    -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='Qwen/Qwen3-0.6B', revision='${MODEL_REVISION}', local_dir='/model')"; then
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
  --memory 7g \
  --cpus 8 \
  -v "${WORK_DIR}/model:/model:ro" \
  -v "${WORK_DIR}/output:/output" \
  -v "${SCRIPT_DIR}/data_quant.json:/data_quant.json:ro" \
  "${IMAGE}" \
  --model /model \
  --dataset /data_quant.json \
  --output "/output/${OUTPUT_NAME}" \
  --max-context 2048 \
  --algorithm "${QUANT_ALGORITHM}"

shasum -a 256 "${WORK_DIR}/output/${OUTPUT_NAME}"
