from pathlib import Path
import unittest

from jinja2 import Environment, FileSystemLoader, StrictUndefined


ROLE_DIR = Path(__file__).resolve().parents[1]


class TonemXhttpEdgeTemplateTest(unittest.TestCase):
    def setUp(self):
        self.environment = Environment(
            loader=FileSystemLoader(ROLE_DIR / "templates"),
            undefined=StrictUndefined,
            autoescape=False,
        )

    def test_new_and_legacy_hosts_share_one_tls_edge(self):
        rendered = self.environment.get_template("nginx.conf.j2").render(
            tonem_xhttp_edge_domain="app.tonem.ru",
            tonem_xhttp_edge_cert_name="app.tonem.ru",
            tonem_xhttp_edge_locations=[
                {
                    "path": "/assets/abcdefghijklmnopqrstuvwxyz123456/",
                    "upstream": "127.0.0.1:10086",
                    "proxy_protocol": "http",
                }
            ],
            tonem_xhttp_edge_legacy_vhosts=[
                {
                    "domain": "home.example.com",
                    "cert_name": "home.example.com",
                    "locations": [
                        {
                            "path": "/assets/legacy-path/",
                            "upstream": "127.0.0.1:10085",
                            "proxy_protocol": "http",
                        }
                    ],
                }
            ],
        )
        self.assertIn("server_name app.tonem.ru", rendered)
        self.assertIn("server_name home.example.com", rendered)
        self.assertIn("127.0.0.1:10086", rendered)
        self.assertIn("127.0.0.1:10085", rendered)
        self.assertIn('proxy_set_header X-Real-IP "";', rendered)
        self.assertIn('X-Robots-Tag "noindex, nofollow"', rendered)
        self.assertIn("error_log /dev/null crit", rendered)
        self.assertIn("return 302 https://tonem.ru/", rendered)

    def test_compose_reuses_existing_landing_service_and_latest_is_overridable(self):
        rendered = self.environment.get_template("docker-compose.yml.j2").render(
            tonem_xhttp_edge_image="cnstbmb/tonem-web:latest",
            tonem_xhttp_edge_container_name="landing-lite",
            tonem_xhttp_edge_nginx_file="/opt/landing-lite/nginx.conf",
            tonem_xhttp_edge_analytics_config_file="/opt/landing-lite/analytics-config.js",
            tonem_xhttp_edge_acme_dir="/var/www/tonem-xhttp-acme",
        )
        self.assertIn("services:\n  landing:", rendered)
        self.assertIn("${TONEM_XHTTP_IMAGE:-cnstbmb/tonem-web:latest}", rendered)
        self.assertIn("network_mode: host", rendered)
        self.assertIn("analytics-config.js:/usr/share/nginx/html/analytics-config.js:ro", rendered)

    def test_retired_legacy_host_keeps_tls_cover_without_xhttp_location(self):
        rendered = self.environment.get_template("nginx.conf.j2").render(
            tonem_xhttp_edge_domain="app.tonem.ru",
            tonem_xhttp_edge_cert_name="app.tonem.ru",
            tonem_xhttp_edge_locations=[
                {
                    "path": "/assets/abcdefghijklmnopqrstuvwxyz123456/",
                    "upstream": "127.0.0.1:10086",
                    "proxy_protocol": "http",
                }
            ],
            tonem_xhttp_edge_legacy_vhosts=[
                {
                    "domain": "home.example.com",
                    "cert_name": "home.example.com",
                    "locations": [],
                }
            ],
        )
        self.assertIn("server_name home.example.com", rendered)
        self.assertIn("/etc/letsencrypt/live/home.example.com/fullchain.pem", rendered)
        self.assertNotIn("127.0.0.1:10085", rendered)
        self.assertIn("return 302 https://tonem.ru/", rendered)

    def test_role_has_http01_health_gate_and_previous_image_rollback(self):
        tasks = (ROLE_DIR / "tasks" / "main.yml").read_text()
        self.assertIn("--webroot", tasks)
        self.assertNotIn("--dns-cloudflare", tasks)
        self.assertIn("- nginx\n          - -t", tasks)
        self.assertIn("local/tonem-xhttp-edge:rollback", tasks)
        self.assertIn("Restore previous TONEM XHTTP edge compose file", tasks)
        self.assertIn("docker-compose.tonem-xhttp-rollback.yml", tasks)
        self.assertIn('url: "https://api.tonem.ru/live"', tasks)
        self.assertNotIn('url: "https://api.tonem.ru/health"', tasks)


if __name__ == "__main__":
    unittest.main()
