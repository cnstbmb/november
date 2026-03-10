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
По умолчанию `enable_remnawave_node` для `workers` выключен.

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
tools/ansible/run_prod_private.sh --playbook master
tools/ansible/run_prod_private.sh --playbook workers --check
tools/ansible/run_prod_private.sh --playbook /Users/konstantin/november/ansible/playbooks/master.yml
```
