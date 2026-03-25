# Remnawave Profile Templates

Файлы:

- `entry_ru_to_de.profile.example.json`: шаблон `Config Profile` для entry-ноды:
вход клиентов на RU entry (`inbounds`), локальный выход для RU (`outbound: DIRECT`), выход через DE node для всего остального (`outbound: DE_EXIT`).
- `worker-node.docker-compose.example.yml`: пример compose для worker-ноды (`remnawave/node`).
- `../bootstrap_remnawave_topology.sh`: интерактивный helper, который подготавливает
  private JSON-профили для двух схем:
  - `edge -> transit -> multiple exits` на `XHTTP`
  - `entry -> master -> exit + WireGuard`
- `entry-master-exit/`: канонические templates и renderer для схемы
  `ENTRY_NODE -> MASTER_NODE -> EXIT_NODE`, включая `10443`, `20443` и
  обязательный `WireGuard` inbound на master.

## Как применить

1. Запустить `tools/ansible/bootstrap_remnawave_topology.sh`.
2. Выбрать нужный generation mode.
3. Проверить сгенерированные JSON в `.private/ansible/prod/remnawave-topology/profiles/`.
4. Импортировать `Config Profiles` в Remnawave и привязать их к нужным нодам.
5. Применить firewall/node изменения через Ansible.

## Важно

- Это шаблон, не готовый прод-конфиг.
- Для `entry-master-exit` используй [README.md](/Users/konstantin/november/tools/ansible/remnawave/entry-master-exit/README.md) в подпапке как source of truth.
- Перед продом проверь сертификаты, service-user UUID и `SECRET_KEY` нод.
