# Remnawave Cascade Profile (Entry -> Exit)

Файлы:

- `entry_ru_to_de.profile.example.json`: шаблон `Config Profile` для entry-ноды:
вход клиентов на RU entry (`inbounds`), локальный выход для RU (`outbound: DIRECT`), выход через DE node для всего остального (`outbound: DE_EXIT`).
- `worker-node.docker-compose.example.yml`: пример compose для worker-ноды (`remnawave/node`).
- `../bootstrap_remnawave_topology.sh`: интерактивный helper, который подготавливает
  private JSON-профили для схемы `edge -> transit -> multiple exits` на `XHTTP`,
  умеет включать optional direct client ingress на worker-нодах и пишет
  `firewall_extra_tcp_ports` в host vars.

## Как применить

1. Скопировать файл и заменить все `REPLACE_*` значения.
2. В панели Remnawave создать/обновить `Config Profile` этим JSON.
3. Привязать профиль к entry-ноде (RU).
4. На DE-ноде поднять соответствующий inbound (совпадает с `DE_EXIT` параметрами).
5. Проверить, что worker-ноды задеплоены через Ansible (playbook `workers.yml`).

## Важно

- Это шаблон, не готовый прод-конфиг.
- Перед продом проверь совместимость метода/шифра и порта с твоей DE-нодой.
- Для multi-geo добавляй outbounds (`NL_EXIT`, `TR_EXIT`) и правила в `routing.rules`.
