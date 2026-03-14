# Ansible layout and usage

This directory contains inventories, playbooks, and roles for provisioning master and worker nodes.
All required variables are marked with `########` and must be replaced before running.

## 1) Prerequisites

- Ensure SSH access to all nodes with a key.
- Ensure DNS records are ready if you use public domains and TLS.
- If you run playbooks from your local machine, install Ansible (2.15+ recommended).
- If you use `prepare_remote.sh`, Ansible is installed automatically on the master node.

## 2) Fill required variables

Edit these files and replace all `########` placeholders:

- `ansible/inventories/prod/hosts.yml`
- `ansible/inventories/prod/group_vars/all.yml`
- `ansible/inventories/prod/group_vars/master.yml` (optional overrides)
- `ansible/inventories/prod/group_vars/workers.yml` (optional overrides)

### Minimum required values

- `ansible_user`, `ansible_port`, `ssh_public_key_path`
- `timezone`, `swap_size_mb`
- `repo_root`, `compose_project_name`
- `letsencrypt_email`, `cloudflare_api_token` in `group_vars/all.yml` (if `enable_certbot: true`)
- `backup_target`, `backup_password`, `backup_paths`, `backup_keep_*`, `backup_cron_*` (if backups enabled)
- `monitoring_*` values (if monitoring enabled)
- `remnashop_env_src` in `group_vars/master.yml` if `enable_remnashop: true` (recommended)

## 3) Decide nginx/certbot strategy

Certbot role now runs on both `master` and `workers` playbooks.
By default it:

- installs `certbot` and `python3-certbot-dns-cloudflare`
- issues/renews certs via DNS-01 when `enable_certbot: true`
- waits `certbot_dns_propagation_seconds` seconds before DNS-01 validation
- enables `certbot.timer` for automatic renewal
- installs deploy hook that reloads nginx containers after renewal

Per-host domains are read from `host_vars/<host>/certbot.yml` (`certbot_domains` list),
or fallback to `inventory_hostname`.
In bootstrap flow, these domains are generated automatically from host names
entered as `domain=ip`.

When `allow_http_https: true`, firewall role opens TCP ports from `firewall_master_tcp_ports`
(by default on master: `80`, `443`).

## 4) Run the playbooks (local control machine)

From repo root on your machine:

``` bash
ansible-playbook -i ansible/inventories/prod/hosts.yml ansible/playbooks/site.yml
```

## 4.1) Two-step bootstrap on a remote server

If you want to run everything from the master node itself without committing
filled configs back to the repo:

Pre-check:

- All `########` placeholders are filled.
- SSH key is present on master and on all workers.
- Inventory has correct IPs/hostnames.
- Ports 80/443 are free on the host if you enable host nginx/certbot.

1) Copy SSH key to the master and to all worker nodes.
2) Run the prepare step (installs deps and pulls repo):

``` bash
REPO_URL="########" REPO_DIR="/opt/november" \
BRANCH="main" \
sudo sh ansible/prepare_remote.sh
```

3) Edit configs locally on the master (no need to push):

- `ansible/inventories/prod/hosts.yml`
- `ansible/inventories/prod/group_vars/all.yml`
- `ansible/inventories/prod/group_vars/master.yml`
- `ansible/inventories/prod/group_vars/workers.yml`

4) Run with validation:

``` bash
REPO_DIR="/opt/november" \
INVENTORY_PATH="ansible/inventories/prod/hosts.yml" \
PLAYBOOK_PATH="ansible/playbooks/site.yml" \
sh ansible/run_playbooks.sh
```

Notes:

- The prepare step installs `ansible` and `git` on the master and pulls your repo.
- It uses `git sparse-checkout` to fetch only `ansible/` and `deployments/prod`.
- The run step validates that no `########` placeholders remain before running.
- It runs the playbook locally from the master to all nodes via SSH.
- It assumes Debian/Ubuntu (uses `apt-get`).

### Targeting only master or workers

``` bash
ansible-playbook -i ansible/inventories/prod/hosts.yml ansible/playbooks/master.yml
ansible-playbook -i ansible/inventories/prod/hosts.yml ansible/playbooks/workers.yml
```

## 5) Remnawave Nodes

If `enable_remnawave_node: true`, remnawave node is deployed on the selected host
from `deployments/prod/remnawave-node/docker-compose.yml`.

Recommended flow:

- use `tools/ansible/bootstrap_remnawave_node_env.sh` to generate per-host private `.env`
- keep secrets in `.private/ansible/prod/remnawave-node/<host>.env`
- store host override in `.private/ansible/prod/host_vars/<host>/remnawave_node.yml`

On deploy, Ansible opens node TCP port automatically from `NODE_PORT`/`APP_PORT`
in host `.env` (fallback: `node_firewall_port`, default `2222`).

## 6) Monitoring (optional)

If `enable_monitoring: true`, a small monitoring stack is deployed in the `monitoring_dir` path:

- Prometheus on `monitoring_prometheus_port`
- Grafana on `monitoring_grafana_port`
- Loki on `monitoring_loki_port`

By default, UFW does not open these ports. Access via SSH tunnel or update firewall rules.

## 7) Backups (optional)

If `enable_backups: true`, the `backups` role installs `restic`, writes a backup script,
and schedules a cron job. Make sure:

- `backup_target` is reachable from the master node
- `backup_paths` includes your data directories (e.g. `/srv/pg-data`, `/srv/logs`, `/etc`)

## 8) Common failure points

- Wrong SSH port or user in inventory
- Missing SSH public key file on the control machine
- Ports 80/443 already in use by Docker and host nginx enabled
- Certbot enabled, but missing `letsencrypt_email` / `cloudflare_api_token`
- Certbot enabled, but invalid or missing per-host domain in `host_vars/<host>/certbot.yml`
- Certbot enabled, but inventory host is an IP instead of domain (use `domain=ip`)
- `backup_target` requires network access not permitted on the server
- `remnashop` enabled, but `.env` still has `change_me` placeholders

## 9) AdGuard Home (optional)

If you want AdGuard Home on the master node, set in:

- `ansible/inventories/prod/group_vars/master.yml`

```
enable_adguard: true
```

Defaults:

- Web UI on port 3000
- DNS on port 53 TCP/UDP
- Data in `/opt/adguardhome`

If port 53 is already in use on the master, change `adguard_dns_port` or
disable the conflicting service.
