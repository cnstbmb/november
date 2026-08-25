from pathlib import Path
import unittest

from jinja2 import Environment, FileSystemLoader, StrictUndefined


ROLE_DIR = Path(__file__).resolve().parents[1]


class TonemXhttpMasterTemplateTest(unittest.TestCase):
    def setUp(self):
        self.environment = Environment(
            loader=FileSystemLoader(ROLE_DIR / "templates"),
            undefined=StrictUndefined,
            autoescape=False,
        )

    def test_public_vhost_includes_private_locations_and_disables_tracking(self):
        rendered = self.environment.get_template("server.conf.j2").render(
            remnawave_tonem_xhttp_domain="live.tonem.ru",
            remnawave_tonem_xhttp_cert_name="live.tonem.ru",
            remnawave_tonem_xhttp_upstream="tonem-web:80",
        )
        self.assertIn("server_name live.tonem.ru", rendered)
        self.assertIn(
            "include /etc/nginx/tonem-xhttp/locations/live.tonem.ru.conf;",
            rendered,
        )
        self.assertIn('X-Robots-Tag "noindex, nofollow"', rendered)
        self.assertIn("location = /client-telemetry", rendered)
        self.assertIn("location ^~ /analytics/", rendered)
        self.assertIn("window.__TONEM_ANALYTICS__ = { enabled: false }", rendered)
        self.assertIn("error_log /dev/null crit", rendered)
        self.assertNotIn("/assets/private", rendered)

    def test_private_location_strips_client_ip_headers(self):
        rendered = self.environment.get_template("locations.conf.j2").render(
            remnawave_tonem_xhttp_locations=[
                {
                    "path": "/assets/abcdefghijklmnopqrstuvwxyz123456/",
                    "upstream": "host.docker.internal:10086",
                    "proxy_protocol": "grpc",
                }
            ]
        )
        self.assertIn("grpc_pass grpc://host.docker.internal:10086", rendered)
        self.assertIn('grpc_set_header X-Real-IP "";', rendered)
        self.assertIn('grpc_set_header X-Forwarded-For "";', rendered)
        self.assertIn("access_log off", rendered)

    def test_role_uses_http01_and_validates_before_reload(self):
        tasks = (ROLE_DIR / "tasks" / "main.yml").read_text()
        self.assertIn("--webroot", tasks)
        self.assertNotIn("--dns-cloudflare", tasks)
        self.assertIn("nginx -t", tasks)
        self.assertIn("Deny public access to master TONEM XHTTP backends", tasks)
        self.assertIn("from_ip: \"{{ remnawave_tonem_xhttp_docker_bridge_cidr }}\"", tasks)
        self.assertIn("local/tonem-xhttp-master:rollback", tasks)
        self.assertIn("local/tonem-xhttp-server:rollback", tasks)
        self.assertIn("--no-deps --pull never tonem-server", tasks)
        self.assertIn('url: "https://api.tonem.ru/live"', tasks)
        self.assertNotIn('url: "https://api.tonem.ru/health"', tasks)


if __name__ == "__main__":
    unittest.main()
