import pathlib
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
ROLE_ROOT = REPO_ROOT / "infra" / "ansible" / "roles" / "home_ai"


class HomeAiDeploymentContractTest(unittest.TestCase):
    def test_broker_host_group_exists_before_systemd_unit_is_started(self):
        defaults = (ROLE_ROOT / "defaults" / "main.yml").read_text(encoding="utf-8")
        tasks = (ROLE_ROOT / "tasks" / "main.yml").read_text(encoding="utf-8")
        unit = (ROLE_ROOT / "templates" / "home-ai-action-broker.service.j2").read_text(
            encoding="utf-8"
        )

        self.assertIn("home_ai_bot_group: home-ai-bot", defaults)
        create_group = tasks.index("- name: Create home AI bot system group")
        create_directories = tasks.index("- name: Create home AI directories")
        self.assertLess(create_group, create_directories)
        self.assertIn("ansible.builtin.group:", tasks[create_group:create_directories])
        self.assertIn("Group={{ home_ai_bot_group }}", unit)

    def test_rkllm_health_stays_on_the_internal_compose_network(self):
        tasks = (ROLE_ROOT / "tasks" / "main.yml").read_text(encoding="utf-8")
        compose = (ROLE_ROOT / "templates" / "docker-compose.yml.j2").read_text(
            encoding="utf-8"
        )

        self.assertNotIn("\n    ports:\n", compose)
        self.assertIn('fetch("http://rkllm:8080/v1/models")', tasks)
        self.assertNotIn("http://127.0.0.1:", tasks)

    def test_stack_is_reconciled_after_docker_and_action_broker_on_boot(self):
        tasks = (ROLE_ROOT / "tasks" / "main.yml").read_text(encoding="utf-8")
        unit = (ROLE_ROOT / "templates" / "home-ai-stack.service.j2").read_text(
            encoding="utf-8"
        )

        self.assertIn(
            "After=network-online.target docker.service home-ai-action-broker.service",
            unit,
        )
        self.assertIn(
            "Requires=docker.service home-ai-action-broker.service",
            unit,
        )
        self.assertIn(
            "ExecStart=/usr/bin/docker compose --project-name {{ home_ai_project_name }}",
            unit,
        )
        self.assertIn(
            "ExecStartPre=/usr/bin/test -S {{ home_ai_action_broker_socket }}",
            unit,
        )
        self.assertIn("up -d --remove-orphans", unit)
        self.assertIn("Restart=on-failure", unit)

        write_compose = tasks.index("- name: Write home AI Compose file")
        install_unit = tasks.index("- name: Install home AI stack systemd unit")
        enable_unit = tasks.index("- name: Enable home AI stack reconciliation")
        self.assertLess(write_compose, install_unit)
        self.assertLess(install_unit, enable_unit)
        self.assertIn("enabled: true", tasks[enable_unit:])


if __name__ == "__main__":
    unittest.main()
