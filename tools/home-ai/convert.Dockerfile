FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7

ARG RKLLM_COMMIT=878f9361fd3afa7e167b7079918918f78d2c1c2a

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git git-lfs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone https://github.com/airockchip/rknn-llm.git \
    && cd rknn-llm \
    && git checkout "${RKLLM_COMMIT}" \
    && test "$(git rev-parse HEAD)" = "${RKLLM_COMMIT}"

COPY convert-requirements.lock /tmp/convert-requirements.lock
RUN python -m pip install --no-cache-dir --no-deps \
      --index-url https://download.pytorch.org/whl/cpu \
      torch==2.6.0 torchvision==0.21.0 \
    && python -m pip install --no-cache-dir \
      -r /tmp/convert-requirements.lock \
    && python -m pip install --no-cache-dir --no-deps \
      /opt/rknn-llm/rkllm-toolkit/packages/rkllm_toolkit-1.3.0-cp312-cp312-linux_x86_64.whl \
    && python -c 'from rkllm.api import RKLLM; print(RKLLM)'

COPY convert_rkllm.py /usr/local/bin/convert-rkllm
RUN chmod 0755 /usr/local/bin/convert-rkllm

ENTRYPOINT ["/usr/local/bin/convert-rkllm"]
