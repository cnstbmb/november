# Private Ansible Config Bootstrap

Эти скрипты помогают держать боевые настройки вне git.

## Что делают

- `bootstrap_private_vars.sh` интерактивно спрашивает значения и создаёт:
  - `.private/ansible/prod/hosts.yml`
  - `.private/ansible/prod/group_vars/all.yml`
  - `.private/ansible/prod/group_vars/master.yml`
  - `.private/ansible/prod/group_vars/workers.yml`
- `run_prod_private.sh` запускает playbook с private inventory.

## Как использовать

```bash
tools/ansible/bootstrap_private_vars.sh
tools/ansible/run_prod_private.sh
```

## С нуля на чистых VPS

Рекомендуемый порядок для новой сети:

1. Создать inventory и private vars:

```bash
npm run ansible:bootstrap
```

Что делает шаг:
- создаёт `.private/ansible/prod/hosts.yml`
- создаёт `.private/ansible/prod/group_vars/all.yml`
- создаёт `.private/ansible/prod/group_vars/master.yml`
- создаёт `.private/ansible/prod/group_vars/workers.yml`
- создаёт `host_vars/<host>/certbot.yml` для certbot доменов

2. Поднять базовую инфраструктуру и master control-plane:

```bash
npm run ansible:base
npm run ansible:master
```

Что делает шаг:
- `base` ставит Docker/UFW/fail2ban и открывает базовые firewall rules
- `master` поднимает certbot, Remnawave panel, AdGuard, monitoring, backups

3. Зайти в Remnawave panel и создать ноды, чтобы получить management secret для каждой ноды
(`Nodes -> Management`).

Важно:
- ноды в panel можно создать до `Config Profile`
- `node-env` использует именно management secret ноды
- `topology` генерирует профили и не требуется для самого шага создания нод

4. Сгенерировать private `.env` для remnawave-node на тех хостах, где нода должна быть установлена:

```bash
npm run ansible:node-env
```

Что делает шаг:
- спрашивает, включать ли `remnawave_node` на `master`
- спрашивает, включать ли `remnawave_node` на `workers`
- пишет `.private/ansible/prod/remnawave-node/<host>.env`
- пишет `.private/ansible/prod/host_vars/<host>/remnawave_node.yml`

5. Сгенерировать topology и `Config Profile` JSON для Remnawave:

```bash
npm run ansible:topology
```

Что делает шаг:
- по умолчанию готовит текущую каноническую схему
  `entry -> master -> exit + WireGuard`
- также умеет legacy-схему `edge -> transit -> multiple exits` на `XHTTP`
- позволяет выбирать inventory hosts по номеру или по hostname
- использует жёсткие opinionated defaults для camouflage-полей:
  - `entry -> client`: `sun6-22.userapi.com`
  - `entry -> master`: `/fluegergeheimer`
  - `master public`: `borsaistanbul.com:443`
  - `master direct`: `borsaistanbul.com:443`
  - `master -> exit`: `gRPC/TLS` на `8443`
- пишет JSON профили в `.private/ansible/prod/remnawave-topology/profiles`
- пишет `firewall_extra_tcp_ports` и `firewall_extra_udp_ports` в
  `.private/ansible/prod/host_vars/<host>/remnawave_topology.yml`

Если service-user UUID ещё не готовы, helper допускает placeholder `REPLACE_*`.
Это не мешает сначала сделать `node-env`, а потом вернуться к профилям.

Опционально, если нужна отдельная Subscription Page для Remnawave вместо raw
`/api/sub` endpoint, после panel bootstrap можно подготовить её private vars и DNS:

```bash
npm run ansible:subscription-page
```

Что делает шаг:
- читает `master` из `.private/ansible/prod/hosts.yml`
- пишет bundled Subscription Page vars в `.private/ansible/prod/group_vars/master.yml`
- добавляет subdomain в `.private/ansible/prod/host_vars/<master>/certbot.yml`
- может сразу создать/обновить `A/AAAA` запись в Cloudflare
- после этого достаточно выполнить `npm run ansible:master`

6. Импортировать generated JSON профили в Remnawave panel и привязать их к нодам.

7. Проверить generated private config и при необходимости подправить:

- `.private/ansible/prod/group_vars/master.yml`
- `.private/ansible/prod/group_vars/workers.yml`
- `.private/ansible/prod/host_vars/*`

8. Прогнать dry-run:

```bash
npm run ansible:run:check
```

9. Применить на серверах:

```bash
npm run ansible:run
```

Если ОС только что переустановлены и нужен поэтапный старт:

```bash
npm run ansible:base
npm run ansible:master
npm run ansible:workers
```

`site` эквивалентен последовательности `base -> master -> workers`.

Подготовка боевых `.env` для remnawave-node на выбранных hosts (`master` и/или `workers`) (интерактивно):

```bash
tools/ansible/bootstrap_remnawave_node_env.sh
```

Подготовка private topology vars и `Config Profile` JSON для двух поддерживаемых схем:

- текущая каноническая: `entry -> master -> exit + WireGuard`
- legacy: `edge -> transit -> multiple exits` на `XHTTP`

```bash
tools/ansible/bootstrap_remnawave_topology.sh
```

Для текущего прод-конфига source of truth лежит в:

```bash
tools/ansible/remnawave/entry-master-exit/
```

Подготовка private vars для bundled Remnawave Subscription Page
(`sub.domain` + `REMNAWAVE_API_TOKEN` + certbot SAN + optional Cloudflare DNS):

```bash
tools/ansible/bootstrap_remnawave_subscription_page.sh
```

Готовые sanitized templates для схемы `ENTRY -> MASTER -> EXIT`
с `Reality/TCP`, `XHTTP/TLS`, `gRPC/TLS`, optional `DIRECT_EXIT`
и mandatory `WireGuard`
лежат в:

```bash
tools/ansible/remnawave/entry-master-exit/
```

См.:

- `ENTRY_NODE.profile.template.json`
- `MASTER_NODE.profile.template.json`
- `EXIT_NODE.profile.template.json`
- `DIRECT_EXIT.profile.template.json`
- `README.md` с mapping по `Hosts`, `Internal Squads`, `system users`

Важно: при `enable_remnawave_node=true` роль `remnawave_node` требует, чтобы
`node_env_src` для каждого хоста, где включена нода, был задан и файл существовал
локально на control-node.

Для `enable_remnashop=true` можно задать private env-файл через
`remnashop_env_src` в `.private/ansible/prod/group_vars/master.yml`.
Если `remnashop_env_src` пустой, на target остаётся `.env.example`, и при
`remnashop_validate_env=true` плейбук остановится на placeholder `change_me`.
По умолчанию remnashop в bootstrap выключен. Если включить remnashop, bootstrap
предложит и создаст файл:
`.private/ansible/prod/remnashop/.env`.
Если одновременно включены `monitoring` и `AdGuard`, bootstrap по умолчанию
предложит `adguard_web_port=3001`, чтобы избежать конфликта с Grafana (`3000`).
Если нужно управлять самим `AdGuardHome.yaml` через Ansible, включайте это отдельно
через `adguard_manage_config: true` в `.private/ansible/prod/group_vars/master.yml`
и храните чувствительные поля (`adguard_users`, IP-ограничения и т.п.) только в `.private`.
Для workers bootstrap по умолчанию готовит `stubby` на DNS-over-TLS к master:
- upstream address берётся из `master` -> `ansible_host`
- TLS auth name берётся из первого `certbot_domains` master
- TLS port: `953`
По умолчанию bootstrap также включает certbot для всех хостов (`master` + `workers`),
спрашивает `letsencrypt_email` и `cloudflare_api_token`.
Домены для certbot берутся автоматически из host names, которые вы вводите в первом шаге
(`domain=ip`), и сохраняются в:
`.private/ansible/prod/host_vars/<host>/certbot.yml`.
В `group_vars/all.yml` bootstrap также пишет `certbot_dns_propagation_seconds: 60`.
Опционально bootstrap может сразу создать/обновить A/AAAA записи в Cloudflare по этим
парам `domain=ip`.
После деплоя Ansible включает `certbot.timer`, а renew hook автоматически делает reload
nginx-контейнеров (`remnawave-panel-proxy` на master, если panel включена).

Если `enable_backups=true`, bootstrap отдельно спросит, нужны ли S3-ключи.
При выборе S3 он запросит `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
(и опционально `AWS_DEFAULT_REGION`) и запишет их в `backup_env` в
`.private/ansible/prod/group_vars/all.yml`.
Если target введён как `https://...`, скрипт автоматически преобразует его в
формат restic `s3:https://...`.
Для Remnawave на master разумный набор путей такой:
- `/opt/remnawave-panel`
- `/opt/remnawave-node`
- `/opt/adguardhome`
- `/var/backups/remnawave`
- `/etc/letsencrypt`

Для workers:
- `/opt/remnawave-node`
- `/etc/letsencrypt`
- `/etc/stubby`

Прогрев SSH-сессий по всем хостам (по очереди, `ssh ... exit`):

```bash
tools/ansible/warmup_prod_private.sh
```

`bootstrap_private_vars.sh` поддерживает формат хостов:
- `name` (например `test.beer.ru`)
- `name=ip` (например `test.beer.ru=8.80.55.35`)

Во втором случае в inventory будет добавлен `ansible_host`, так что можно
использовать красивое имя хоста даже до настройки DNS.

Скрипт также спрашивает опциональные SSH overrides для каждого хоста:
- `ansible_user` для конкретного master/worker
- `ansible_port` для конкретного master/worker

Если поле оставить пустым, используется глобальный `ansible_user`/`ansible_port`.
По умолчанию `enable_remnawave_node` для `master` и `workers` выключен.
`bootstrap_private_vars.sh` также подставляет первый найденный публичный ключ
из `${HOME}/.ssh/yubikey_9a.pub`, `${HOME}/.ssh/id_ed25519.pub`, `${HOME}/.ssh/id_rsa.pub`
и валидирует, что файл существует.
Для `enable_remnawave_node=true` используется `deployments/prod/remnawave-node/docker-compose.yml`,
а реальные переменные лучше хранить в приватном `node_env_src`.
`bootstrap_remnawave_node_env.sh` создаёт `node_env_src` автоматически в
`.private/ansible/prod/remnawave-node/<host>.env` и host vars для каждого выбранного host.
При деплое `remnawave_node` Ansible автоматически читает `NODE_PORT`/`APP_PORT`
из этого `.env` и открывает соответствующий TCP-порт в UFW на том host, где запускается нода.
`deployments/prod/remnawave-node/docker-compose.yml` также монтирует
`/etc/letsencrypt` в контейнер, чтобы XHTTP/TLS inbounds в custom profiles могли
читать certbot-сертификаты с host.
Каноническое имя контейнера в этом шаблоне — `remnanode`; перед деплоем роль
автоматически удаляет другие legacy-контейнеры на образе `remnawave/node`,
чтобы не возникал конфликт по `2222`.
Для дополнительных портов topology-helper пишет `firewall_extra_tcp_ports` в
`.private/ansible/prod/host_vars/<host>/remnawave_topology.yml`; роль `firewall`
открывает их при следующем прогоне `base`/`site`.

Выбрать playbook интерактивно:

```bash
tools/ansible/run_prod_private.sh --menu
```

Запуск в dry-run режиме:

```bash
tools/ansible/run_prod_private.sh --check
```

Запуск только для части инвентаря:

```bash
tools/ansible/run_prod_private.sh --limit workers
tools/ansible/run_prod_private.sh --check --limit serb.himenkov.ru
tools/ansible/warmup_prod_private.sh --limit workers
```

Явный выбор playbook:

```bash
tools/ansible/run_prod_private.sh --playbook base --limit master
tools/ansible/run_prod_private.sh --playbook master
tools/ansible/run_prod_private.sh --playbook workers --check
tools/ansible/run_prod_private.sh --playbook ansible/playbooks/master.yml
```

После переустановки ОС на master сначала прогоните `base` (установка Docker/UFW и базовой настройки),
затем `master`:

```bash
npm run ansible:base
npm run ansible:master
```
