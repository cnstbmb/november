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

Подготовка боевых `.env` для remnawave-node на выбранных hosts (`master` и/или `workers`) (интерактивно):

```bash
tools/ansible/bootstrap_remnawave_node_env.sh
```

Подготовка private topology vars и `Config Profile` JSON для расширяемой схемы
`edge -> transit -> multiple exits` на `XHTTP`
с optional direct client ingress на выбранных worker-нодах:

```bash
tools/ansible/bootstrap_remnawave_topology.sh
```

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
`.private/ansible/prod/group_vars/master.yml`.
Если target введён как `https://...`, скрипт автоматически преобразует его в
формат restic `s3:https://...`.

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
