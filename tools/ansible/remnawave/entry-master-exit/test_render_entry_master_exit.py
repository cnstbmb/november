import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("render_entry_master_exit.py")
SPEC = importlib.util.spec_from_file_location("render_entry_master_exit", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HomeExitProfileTest(unittest.TestCase):
    def test_hidden_home_squad_reuses_bridge_inbound(self):
        self.assertEqual(
            MODULE.build_home_squad(
                {"host": "home.example.com", "client_public_enabled": False}
            ),
            {"name": "HOME", "inbounds": ["BRIDGE_HOME_RU_IN"]},
        )
        self.assertIsNone(MODULE.build_home_squad(None))

    def test_public_home_squads_only_expose_client_inbound(self):
        home_exit = {"host": "home.example.com", "client_public_enabled": True}
        expected = {
            "name": "HOME",
            "inbounds": ["VLESS_HOME_REALITY_DIRECT"],
        }
        self.assertEqual(MODULE.build_home_squad(home_exit), expected)
        self.assertEqual(
            MODULE.build_home_monitoring_squad(home_exit),
            {
                "name": "HOME Monitoring Squad",
                "inbounds": ["VLESS_HOME_REALITY_DIRECT"],
            },
        )

    def test_home_xhttp_packet_up_uses_loopback_without_tls(self):
        inbound = MODULE.build_direct_client_inbound(
            {
                "public_port": 443,
                "cert_domain": "home.example.com",
                "client_transport": "xhttp_nginx_tls",
                "client_backend_listen": "127.0.0.1",
                "client_backend_port": 10085,
                "client_backend_host": "",
                "client_host": "home.example.com",
                "client_path": "/private-path",
                "client_mode": "packet-up",
            },
            "VLESS_HOME_REALITY_DIRECT",
        )

        self.assertEqual(inbound["listen"], "127.0.0.1")
        self.assertEqual(inbound["port"], 10085)
        self.assertEqual(inbound["streamSettings"]["network"], "xhttp")
        self.assertEqual(inbound["streamSettings"]["security"], "none")
        self.assertEqual(
            inbound["streamSettings"]["xhttpSettings"]["host"], ""
        )
        self.assertEqual(
            inbound["streamSettings"]["xhttpSettings"]["mode"], "packet-up"
        )

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

    def test_exit_domain_overrides_precede_home_geo_routing(self):
        master = {
            "host": "master.example.com",
            "public_address": "203.0.113.10",
            "bridge_inbound_port": 10443,
            "bridge_host": "master.example.com",
            "bridge_path": "/bridge",
            "cert_domain": "master.example.com",
            "reality_moscow": {
                "port": 443,
                "target": "127.0.0.1:443",
                "short_id": "0123456789abcdef",
                "private_key": "test-private-key",
                "server_names": ["master.example.com"],
            },
            "xhttp_moscow": {
                "port": 443,
                "listen": "0.0.0.0",
                "host": "master.example.com",
                "path": "/xhttp/",
                "security": "none",
            },
            "hysteria2_moscow": {
                "port": 443,
                "server_name": "master.example.com",
                "cert_domain": "master.example.com",
            },
            "to_exit_address": "198.51.100.20",
            "to_exit_port": 8443,
            "to_exit_uuid": "11111111-1111-4111-8111-111111111111",
            "to_exit_server_name": "exit.example.com",
            "to_home_ru_address": "198.51.100.30",
            "to_home_ru_port": 8443,
            "to_home_ru_uuid": "22222222-2222-4222-8222-222222222222",
            "to_home_ru_server_name": "home.example.com",
            "route_exit_domains": ["dodois.ru", "api.mindbox.ru"],
            "route_home_geoip": ["ru"],
            "route_home_geosite": ["category-ru"],
        }

        profile = MODULE.build_master_profile(master, {}, {"host": "home.example.com"})
        rules = profile["routing"]["rules"]
        exit_rule_index = next(
            index
            for index, rule in enumerate(rules)
            if rule.get("outboundTag") == "GRPC_TO_EXIT"
            and "domain:dodois.ru" in rule.get("domain", [])
        )
        home_rule_index = next(
            index for index, rule in enumerate(rules) if rule.get("outboundTag") == "GRPC_TO_HOME_RU"
        )
        exit_rule = rules[exit_rule_index]

        self.assertLess(exit_rule_index, home_rule_index)
        self.assertEqual(exit_rule["domain"], ["domain:dodois.ru", "domain:api.mindbox.ru"])
        self.assertEqual(
            exit_rule["inboundTag"],
            [
                "VLESS_REALITY_MOSCOW",
                "BRIDGE_MASTER_IN",
                "VLESS_XHTTP_MOSCOW",
                "HYSTERIA2_MOSCOW",
            ],
        )

    def test_kernel_wireguard_home_exit_uses_bound_freedom_outbound(self):
        master = {
            "host": "master.example.com",
            "public_address": "203.0.113.10",
            "bridge_inbound_port": 10443,
            "bridge_host": "master.example.com",
            "bridge_path": "/bridge",
            "cert_domain": "master.example.com",
            "reality_moscow": {
                "port": 443,
                "target": "127.0.0.1:443",
                "short_id": "0123456789abcdef",
                "private_key": "test-private-key",
                "server_names": ["master.example.com"],
            },
            "to_exit_address": "198.51.100.20",
            "to_exit_port": 8443,
            "to_exit_uuid": "11111111-1111-4111-8111-111111111111",
            "to_exit_server_name": "exit.example.com",
            "home_ru_interface": "home_exit_wg",
            "route_home_tlds": ["ru", "xn--p1ai", "su"],
            "route_home_domains": ["dodois.io", "hikari.example.com"],
            "route_home_geoip": ["ru"],
            "route_home_geosite": ["category-ru"],
        }

        profile = MODULE.build_master_profile(master, {})
        home_outbound = next(
            outbound for outbound in profile["outbounds"] if outbound["tag"] == "WG_TO_HOME_RU"
        )

        self.assertEqual(home_outbound["protocol"], "freedom")
        self.assertEqual(home_outbound["settings"]["domainStrategy"], "UseIPv4")
        self.assertEqual(
            home_outbound["streamSettings"]["sockopt"]["interface"],
            "home_exit_wg",
        )
        self.assertNotIn("balancers", profile["routing"])
        self.assertEqual(profile["observatory"]["subjectSelector"], ["WG_TO_HOME_RU"])
        self.assertTrue(
            any(rule.get("outboundTag") == "WG_TO_HOME_RU" for rule in profile["routing"]["rules"])
        )
        home_domain_rule = next(
            rule
            for rule in profile["routing"]["rules"]
            if "domain:dodois.io" in rule.get("domain", [])
        )
        self.assertEqual(home_domain_rule["outboundTag"], "WG_TO_HOME_RU")
        self.assertEqual(
            home_domain_rule["domain"],
            ["domain:dodois.io", "domain:hikari.example.com"],
        )
        home_tld_rule = next(
            rule
            for rule in profile["routing"]["rules"]
            if "domain:ru" in rule.get("domain", [])
        )
        self.assertEqual(home_tld_rule["outboundTag"], "WG_TO_HOME_RU")
        self.assertEqual(
            home_tld_rule["domain"],
            ["domain:ru", "domain:xn--p1ai", "domain:su"],
        )
        self.assertEqual(profile["routing"]["domainStrategy"], "IPIfNonMatch")


if __name__ == "__main__":
    unittest.main()
