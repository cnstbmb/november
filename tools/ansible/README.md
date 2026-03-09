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

`bootstrap_private_vars.sh` поддерживает формат хостов:
- `name` (например `test.beer.ru`)
- `name=ip` (например `test.beer.ru=8.80.55.35`)

Во втором случае в inventory будет добавлен `ansible_host`, так что можно
использовать красивое имя хоста даже до настройки DNS.

Выбрать playbook интерактивно:

```bash
tools/ansible/run_prod_private.sh --menu
```

Запуск в dry-run режиме:

```bash
tools/ansible/run_prod_private.sh --check
```

Явный выбор playbook:

```bash
tools/ansible/run_prod_private.sh --playbook master
tools/ansible/run_prod_private.sh --playbook workers --check
tools/ansible/run_prod_private.sh --playbook /Users/konstantin/november/ansible/playbooks/master.yml
```
