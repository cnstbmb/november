import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("render_entry_master_exit.py")
SPEC = importlib.util.spec_from_file_location("render_entry_master_exit", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HomeExitProfileTest(unittest.TestCase):
    def test_home_uses_systemd_resolved_instead_of_stubby(self):
        profile = MODULE.build_home_exit_profile(
            {
                "bridge_inbound_port": 8443,
                "cert_domain": "home.example.com",
                "client_public_enabled": False,
            }
        )

        self.assertEqual(profile["dns"]["servers"][0]["address"], "127.0.0.53")
        dns_out = next(outbound for outbound in profile["outbounds"] if outbound["tag"] == "DNS_OUT")
        self.assertEqual(dns_out["settings"]["redirect"], "127.0.0.53:53")


if __name__ == "__main__":
    unittest.main()
