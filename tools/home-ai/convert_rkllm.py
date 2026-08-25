#!/usr/bin/env python3
"""Convert a pinned Hugging Face checkpoint to RKLLM W4A16 for RK3576."""

from __future__ import annotations

import argparse
from pathlib import Path

from rkllm.api import RKLLM


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-context", default=2048, type=int)
    parser.add_argument("--algorithm", choices=("normal", "grq"), default="normal")
    return parser.parse_args()


def require_success(operation: str, result: int) -> None:
    if result != 0:
        raise SystemExit(f"{operation} failed with RKLLM status {result}")


def main() -> None:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    llm = RKLLM()
    require_success(
        "load_huggingface",
        llm.load_huggingface(
            model=str(args.model),
            model_lora=None,
            device="cpu",
            dtype="bfloat16",
            custom_config=None,
            load_weight=True,
        ),
    )
    require_success(
        "build",
        llm.build(
            do_quantization=True,
            optimization_level=0,
            quantized_dtype="W4A16",
            quantized_algorithm=args.algorithm,
            target_platform="RK3576",
            num_npu_core=2,
            extra_qparams=None,
            dataset=str(args.dataset),
            hybrid_rate=0,
            max_context=args.max_context,
        ),
    )
    require_success("export_rkllm", llm.export_rkllm(str(args.output)))


if __name__ == "__main__":
    main()
