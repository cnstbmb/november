from pathlib import Path
import unittest


ROLE_DIR = Path(__file__).resolve().parents[1]


class RemnawavePanelTonemExtensionTest(unittest.TestCase):
    def test_proxy_mounts_private_extensions_and_acme_webroot(self):
        compose = (ROLE_DIR / "templates" / "docker-compose.yml.j2").read_text()
        self.assertIn(":/etc/nginx/tonem-xhttp:ro", compose)
        self.assertIn(":/var/www/tonem-xhttp-acme:ro", compose)
        self.assertIn("host.docker.internal:host-gateway", compose)

    def test_nginx_loads_transport_owned_server_fragments(self):
        nginx = (ROLE_DIR / "templates" / "nginx.conf.j2").read_text()
        self.assertIn("include /etc/nginx/tonem-xhttp/servers/*.conf;", nginx)


if __name__ == "__main__":
    unittest.main()

