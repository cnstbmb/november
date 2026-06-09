# nativeProxy Ansible

Minimal Ansible profile for a weak single VPS: no Docker, no monitoring, no app runtime.

It installs:

- base packages, timezone and optional swap
- SSH hardening
- UFW
- fail2ban
- Certbot with Cloudflare DNS-01
- nginx serving a static landing page on `127.0.0.1:8080`
- `nativeproxy.service` as a systemd service on public `443`

The systemd service runs as a dedicated `nativeproxy` user. Certbot keeps the
original Let's Encrypt files under `/etc/letsencrypt`; the deploy hook copies the
active certificate and key into `/etc/nativeproxy/tls` with group-readable
permissions for the service.

## Layout

```text
infra/nativeproxy-ansible/
  inventories/prod/hosts.yml
  inventories/prod/group_vars/all.yml
  playbooks/site.yml
  roles/
deployments/landing-lite/site/
```

## Configure

Edit:

```bash
infra/nativeproxy-ansible/inventories/prod/hosts.yml
infra/nativeproxy-ansible/inventories/prod/group_vars/all.yml
```

For real secrets, prefer a private extra-vars file ignored by git, for example:

```bash
mkdir -p .private/nativeproxy
$EDITOR .private/nativeproxy/prod.yml
```

Then pass it with `-e @.private/nativeproxy/prod.yml`.

Set at minimum:

- real host and `ansible_host`
- `letsencrypt_email`
- `cloudflare_api_token`
- `certbot_domains`
- `native_proxy_binary_src` or `native_proxy_binary_url`
- `native_proxy_tls_cert_path` and `native_proxy_tls_key_path`

If nativeProxy uses a config format different from the included YAML skeleton,
create the config locally and set:

```yaml
native_proxy_config_src: "/absolute/path/to/nativeproxy-config.yml"
```

## Run

From repository root:

```bash
ANSIBLE_CONFIG=infra/nativeproxy-ansible/ansible.cfg ansible-playbook infra/nativeproxy-ansible/playbooks/site.yml --check
ANSIBLE_CONFIG=infra/nativeproxy-ansible/ansible.cfg ansible-playbook infra/nativeproxy-ansible/playbooks/site.yml
```

With private vars:

```bash
npm run nativeproxy:ansible:check -- -e @.private/nativeproxy/prod.yml
npm run nativeproxy:ansible -- -e @.private/nativeproxy/prod.yml
```

## Cleanup old home Remnawave node

Once SSH access is available, this removes only remnawave-node artifacts from
`home.himenkov.ru` and keeps base services, certbot, stubby, Docker and landing:

```bash
tools/nativeproxy-ansible/cleanup_home_remnawave.sh
```

The landing uses the existing `deployments/landing-lite/site` artifact and is
intentionally bound only to localhost. Public `443` is expected to belong to
nativeProxy, with fallback upstream set to `http://127.0.0.1:8080`.
