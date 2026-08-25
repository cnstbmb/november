import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("patch_rkllm_server.py")
SPEC = importlib.util.spec_from_file_location("patch_rkllm_server", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


FIXTURE = '''
class RKLLM:
    def __init__(self):
        self.rkllm_run.restype = ctypes.c_int

    def run(self):
        return
    
    def abort(self):
        pass

def build_openai_error(message, error_type="invalid_request_error", status_code=400):
    pass

@app.route('/v1/chat/completions', methods=['POST'])
def chat_completions():
    pass
'''


class PatchRkllmServerTest(unittest.TestCase):
    def test_adds_kv_reset_binding_method_and_internal_endpoint(self):
        patched = MODULE.patch_source(FIXTURE)

        self.assertIn("rkllm_lib.rkllm_clear_kv_cache", patched)
        self.assertIn("def clear_kv_cache(self):", patched)
        self.assertIn("@app.route('/v1/clear-kv-cache', methods=['POST'])", patched)
        self.assertIn("_last_messages = []", patched)
        compile(patched, "server.py", "exec")
        self.assertEqual(MODULE.patch_source(patched), patched)


if __name__ == "__main__":
    unittest.main()
