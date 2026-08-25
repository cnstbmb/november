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

## HOME Internal Squad

`HOME` is reconciled separately from server deployment so an unrelated `site`
run does not depend on the Remnawave API. The playbook validates the existing
`HOME` Host and `BRIDGE_HOME_RU_IN`, creates the Squad only when missing, and
never modifies user assignments:

```bash
tools/ansible/run_prod_private.sh --playbook remnawave-home-squad --check
tools/ansible/run_prod_private.sh --playbook remnawave-home-squad
```

The API token is read on the controller from
`.private/ansible/prod/remnashop/.env`. It can instead be supplied through the
`REMNAWAVE_API_TOKEN` environment variable or the
`remnawave_home_squad_api_token` Ansible variable.

## HOME XHTTP transport

The HOME client endpoint is deployed separately from the system gRPC bridge.
The playbook prepares a loopback-only VLESS XHTTP `packet-up` inbound, exposes
it through the real HTTPS landing on ports 80/443, and then transactionally
switches the `HOME` and `HOME Monitoring Squad` bindings. It never adds regular
users to `HOME`:

```bash
tools/ansible/run_prod_private.sh --playbook remnawave-home-xhttp --check
tools/ansible/run_prod_private.sh --playbook remnawave-home-xhttp
```

The random XHTTP path is generated once in
`.private/ansible/prod/remnawave-home-xhttp.json`. The public repository stores
only renderer and reconciliation logic. During the client-validation stage,
the legacy gRPC bridge remains available on 8443; restrict it to the master IP
only after Shadowrocket and Happ Plus both pass.

Скрипт не печатает секреты, создаёт приватный backup с правами `0700/0600`,
последовательно обновляет `master -> home` и `master -> exit`, перезапускает
затронутые ноды и синхронизирует активные JSON в `.private`.

После ротации Reality старые сохранённые клиентские ссылки перестают работать.
Клиентам, использующим Reality, нужно обновить подписку.
