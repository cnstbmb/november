from pathlib import Path
import unittest

from jinja2 import Environment, FileSystemLoader, StrictUndefined


ROLE_DIR = Path(__file__).resolve().parents[1]


class WorkerLandingNginxTemplateTest(unittest.TestCase):
    def test_packet_up_proxy_preserves_public_host(self):
        environment = Environment(
            loader=FileSystemLoader(ROLE_DIR / "templates"),
            undefined=StrictUndefined,
            autoescape=False,
        )
        template = environment.get_template("nginx.conf.j2")

        rendered = template.render(
            worker_landing_xhttp_proxy_locations_effective=[
                {
                    "path": "/private-xhttp/",
                    "proxy_protocol": "http",
                    "upstream": "127.0.0.1:10085",
                }
            ],
            worker_landing_enable_https_effective=True,
            worker_landing_domain_effective="home.example.com",
        )

        self.assertIn("proxy_set_header Host $host;", rendered)

    def test_changed_nginx_config_is_reloaded_in_running_container(self):
        tasks = (ROLE_DIR / "tasks" / "main.yml").read_text()

        self.assertIn("register: worker_landing_nginx_config", tasks)
        self.assertIn("nginx -t", tasks)
        self.assertIn("nginx -s reload", tasks)
        self.assertIn("worker_landing_nginx_config.changed", tasks)


if __name__ == "__main__":
    unittest.main()
