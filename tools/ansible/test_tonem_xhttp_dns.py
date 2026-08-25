import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("tonem_xhttp_dns.py")
SPEC = importlib.util.spec_from_file_location("tonem_xhttp_dns", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TonemXhttpDnsTest(unittest.TestCase):
    def test_creates_direct_a_and_removes_aaaa(self):
        targets = {
            "home": {
                "enabled": True,
                "domain": "app.tonem.ru",
                "publicIpv4": "192.0.2.10",
            }
        }
        records = [
            {
                "id": "ipv6",
                "type": "AAAA",
                "name": "app.tonem.ru",
                "content": "2001:db8::10",
                "proxied": False,
            }
        ]
        actions = MODULE.plan_dns_actions(records, targets)
        self.assertEqual([action["action"] for action in actions], ["create", "delete-aaaa"])
        self.assertFalse(actions[0]["payload"]["proxied"])

    def test_repairs_cloudflare_proxied_a(self):
        targets = {
            "moscow": {
                "enabled": True,
                "domain": "live.tonem.ru",
                "publicIpv4": "192.0.2.20",
            }
        }
        records = [
            {
                "id": "a-record",
                "type": "A",
                "name": "live.tonem.ru",
                "content": "192.0.2.20",
                "proxied": True,
            }
        ]
        actions = MODULE.plan_dns_actions(records, targets)
        self.assertEqual(len(actions), 1)
        self.assertEqual(actions[0]["action"], "update")
        self.assertFalse(actions[0]["payload"]["proxied"])

    def test_disabled_target_needs_no_ip(self):
        actions = MODULE.plan_dns_actions(
            [],
            {"exit": {"enabled": False, "domain": "terminal.tonem.ru", "publicIpv4": ""}},
        )
        self.assertEqual(actions, [])


if __name__ == "__main__":
    unittest.main()

