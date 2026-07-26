# Remnawave Profile Tooling

Файлы:

- `worker-node.docker-compose.example.yml`: пример compose для worker-ноды (`remnawave/node`).
- `../bootstrap_remnawave_topology.sh`: интерактивный helper, который подготавливает
  private JSON-профили для двух схем:
  - `entry -> master -> exit + WireGuard (+ optional direct-only exit)` as current canonical topology
  - `edge -> transit -> multiple exits` на `XHTTP` as legacy mode
- `entry-master-exit/`: канонический renderer для схемы
  `ENTRY_NODE -> MASTER_NODE -> EXIT_NODE` и опционального `DIRECT_EXIT`,
  включая `10443`, `20443` и обязательный `WireGuard` inbound на master.

## Как применить

1. Запустить `tools/ansible/bootstrap_remnawave_topology.sh`.
2. Выбрать нужный generation mode.
3. Проверить сгенерированные JSON в `.private/ansible/prod/remnawave-topology/profiles/`.
4. Импортировать `Config Profiles` в Remnawave и привязать их к нужным нодам.
5. Применить firewall/node изменения через Ansible.

## Важно

- Профили генерируются в `.private`; статических JSON-шаблонов в репозитории нет.
- Для `entry-master-exit` используй [README.md](/Users/konstantin/november/tools/ansible/remnawave/entry-master-exit/README.md) в подпапке как source of truth.
- Camouflage ограничен собственными доменами: `moscow.himenkov.ru`,
  `himenkov.ru`, `home.himenkov.ru`; Reality использует self-steal target
  `127.0.0.1:443`.
- Перед продом проверь сертификаты, service-user UUID и `SECRET_KEY` нод.

## Аварийная ротация Reality и bridge credentials

Если private Reality-конфиг мог утечь:

```bash
# Read-only сверка live-профиля и service users
npm run remnawave:rotate:credentials:check

# Ротация двух Reality key pairs/shortIds и service-user VLESS UUID
npm run remnawave:rotate:credentials

# Проверка маршрутов, подписки и XHTTP
npm run remnawave:audit:self-steal
```

Скрипт не печатает секреты, создаёт приватный backup с правами `0700/0600`,
последовательно обновляет `master -> home` и `master -> exit`, перезапускает
затронутые ноды и синхронизирует активные JSON в `.private`.

После ротации Reality старые сохранённые клиентские ссылки перестают работать.
Клиентам, использующим Reality, нужно обновить подписку.
