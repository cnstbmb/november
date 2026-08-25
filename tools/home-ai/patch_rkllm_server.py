#!/usr/bin/env python3
import argparse
import pathlib


MARKERS = (
    "rkllm_lib.rkllm_clear_kv_cache",
    "def clear_kv_cache(self):",
    "@app.route('/v1/clear-kv-cache', methods=['POST'])",
)


def _replace_once(source, anchor, replacement):
    if source.count(anchor) != 1:
        raise RuntimeError(f"expected exactly one RKLLM server anchor: {anchor!r}")
    return source.replace(anchor, replacement, 1)


def patch_source(source):
    present = [marker in source for marker in MARKERS]
    if all(present):
        return source
    if any(present):
        raise RuntimeError("refusing to patch a partially modified RKLLM server")

    source = _replace_once(
        source,
        "        self.rkllm_run.restype = ctypes.c_int\n",
        "        self.rkllm_run.restype = ctypes.c_int\n"
        "\n"
        "        self.rkllm_clear_kv_cache = rkllm_lib.rkllm_clear_kv_cache\n"
        "        self.rkllm_clear_kv_cache.argtypes = [\n"
        "            RKLLM_Handle_t, ctypes.c_int, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)\n"
        "        ]\n"
        "        self.rkllm_clear_kv_cache.restype = ctypes.c_int\n",
    )
    source = _replace_once(
        source,
        "        return\n"
        "    \n"
        "    def abort(self):\n",
        "        return\n"
        "    \n"
        "    def clear_kv_cache(self):\n"
        "        return self.rkllm_clear_kv_cache(self.handle, 0, None, None)\n"
        "\n"
        "    def abort(self):\n",
    )
    source = _replace_once(
        source,
        "@app.route('/v1/chat/completions', methods=['POST'])\n",
        "@app.route('/v1/clear-kv-cache', methods=['POST'])\n"
        "def clear_kv_cache():\n"
        "    global _last_messages\n"
        "    with lock:\n"
        "        result = rkllm_model.clear_kv_cache()\n"
        "        if result != 0:\n"
        "            return build_openai_error('Failed to clear RKLLM KV cache.', 'server_error', 503)\n"
        "        _last_messages = []\n"
        "        return jsonify({'ok': True})\n"
        "\n"
        "\n"
        "@app.route('/v1/chat/completions', methods=['POST'])\n",
    )
    return source


def main():
    parser = argparse.ArgumentParser(description="Apply the pinned Jarvis KV reset patch to RKLLM Flask server.")
    parser.add_argument("server", type=pathlib.Path)
    args = parser.parse_args()

    original = args.server.read_text(encoding="utf-8")
    patched = patch_source(original)
    if patched == original:
        print("unchanged")
        return
    args.server.write_text(patched, encoding="utf-8")
    print("patched")


if __name__ == "__main__":
    main()
