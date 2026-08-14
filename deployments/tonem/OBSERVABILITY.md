# Tonem observability, backups and privacy-safe analytics

The implementation is split into independently deployable stages. Health endpoints,
JSON logs, metrics and privacy controls exist in every environment; scraping, SLO,
external checks and notification delivery apply only to production. Applying any
stage to production still requires a separate explicit approval.

## Endpoint contract

| Endpoint | Meaning | Public production access |
| --- | --- | --- |
| `GET /live` | The Node.js process can answer HTTP. No dependency checks. | Yes |
| `GET /ready` | The API can query Postgres. | Yes; generic status only |
| `GET /health` | Collector completion and quote-group freshness. MOEX schedules are respected. | Yes; generic group status only |
| `GET /metrics` | Prometheus process, HTTP, collector, source and quote metrics. | No; private Docker network only |
| `POST /client-telemetry` | Bounded aggregate error categories only. | Yes; 8 KiB body cap, strict schema and rate limits |

The reverse proxy returns `404` for public `/metrics`. Logs never include full
query strings, IP addresses, authorization headers, or request bodies. A random
request ID is generated for one request only.

## Private Ansible variables

Add these values to Ansible Vault or private inventory, never to Git, Compose,
Grafana dashboard JSON, or this file:

```yaml
monitoring_tonem_enabled: true
monitoring_tonem_alerting_enabled: true
monitoring_alerting_telegram_bot_token: "<dedicated-monitoring-bot-token>"
monitoring_alerting_telegram_chat_id: "<dedicated-private-chat-id>"
monitoring_alerting_telegram_proxy_url: "<optional-private-proxy-url>"
monitoring_home_node_name: "<private-inventory-hostname>"
monitoring_home_node_alerting_enabled: true
monitoring_tonem_dashboard_url: "<existing-protected-grafana-url>/d/tonem-operations/tonem"
monitoring_tonem_postgres_exporter_enabled: true
monitoring_tonem_postgres_monitor_user: "tonem_monitor"
monitoring_tonem_postgres_monitor_password: "<dedicated-read-only-password>"
```

`monitoring_tonem_enabled` provisions the Prometheus scrape target, two internal
blackbox checks, the private Tonem dashboard, and a Grafana deployment annotation
after Tonem passes its post-deploy container health check. Alerting additionally provisions:

- Grafana-managed Telegram warning/critical/recovery notifications;
- one-hour repeat interval with per-service/source/instrument grouping;
- a host systemd watchdog for Grafana, Prometheus and Loki. It only sends warning
  and recovery notifications and performs no remediation.

The exporter endpoint is private and uses a dedicated role with `pg_monitor` plus
read-only access. Its password is delivered through root-owned files and is not
embedded in Compose or dashboard JSON.

## Stage 2: backups

Production alert delivery is permanently Telegram-only. Grafana SMTP is disabled,
no email contact point is provisioned, and the monitoring role removes legacy SLO
email timers, sender scripts and credential files.

The standard master `backups` role now creates a Tonem custom-format dump before
Restic. It also briefly pauses Prometheus, Loki and Grafana one at a time, copies
their consistent data directories into `/var/backups/monitoring`, and includes
that staging directory in the same encrypted S3 snapshot. Each container is
unpaused immediately after its copy, including on failure. The role writes
node-exporter success markers only after Restic and retention pruning succeed.
Grafana warns after 26 hours and escalates to critical after 48 hours.

A monthly systemd timer restores the Tonem dump into a separate ephemeral
PostgreSQL container and verifies that public tables exist; it never touches the
live database. Umami has an equivalent isolated monthly restore-check for its
latest daily custom-format dump.

## Stage 3: Umami and product events

Umami 3.2.0 runs in `deployments/tonem-analytics` with its own PostgreSQL volume and
Compose project. It cannot affect Tonem quotes/history. The admin UI binds only to
`127.0.0.1:3300`; reach it through the existing protected SSH entry:

```bash
ssh -L 3300:127.0.0.1:3300 <master>
# then open http://127.0.0.1:3300 and immediately replace the default admin password
```

Only `/analytics/script.js`, `/analytics/api/send`, and `/analytics/api/batch` are
proxied publicly. The ingestion routes pass through the Tonem API, which rejects
unknown event names, fields and Umami request types before forwarding a sanitized
payload. All other Umami UI/admin API paths stay private. The tracker is
async, has a 2-second timeout, performs no retries, strips query/hash values, respects
DNT, and is excluded from the service-worker cache. Analytics failure is warning-only
and never blocks the application.

Allowed product events are exactly:

- `instrument_select`: `instrument_id`;
- `favorite_toggle`: `instrument_id`, `enabled`;
- `hero_pin`: `instrument_id`;
- `time_machine_use`: no date or settings;
- `zen_toggle`, `music_toggle`: `enabled`;
- `pwa_install`, `offline_enter`: no fields;
- pageviews, referrer without query, and broad device type from Umami.

There is no `identify`, cookie, cross-device profile, session replay, mouse tracking,
raw decorative setting, IP persistence, message, stack trace, request body, or auth
header. Browser failures are sent at 10% for ordinary categories and 100% for the
bounded critical categories, then immediately aggregated into Prometheus labels.

Daily maintenance precomputes monthly aggregates, deletes raw Umami data after 90
days, and deletes aggregates after 12 months. The separate analytics backup keeps
7 daily, 4 weekly and 12 monthly dumps in its own Restic host/tag namespace; failure
is warning-only for Tonem.

Private analytics variables:

```yaml
tonem_analytics_enabled: true
tonem_analytics_website_id: "" # first bootstrap only; tracker remains disabled
tonem_analytics_postgres_password: "<private>"
tonem_analytics_database_url: "postgresql://umami:<URL-encoded-password>@tonem-umami-postgres:5432/umami"
tonem_analytics_app_secret: "<at least 32 random characters>"
tonem_analytics_frontend_version: "<release id>"
monitoring_tonem_analytics_enabled: true
```

The analytics bootstrap requires two separately approved applies. The first starts
the private stack with the tracker disabled. Then change the initial admin password,
create the `tonem.ru` website manually, put its public UUID in
`tonem_analytics_website_id`, repeat check-mode, and approve the second apply to
enable tracking. All Compose, config, timers, retention, backup and monitoring
remain provisioned through Ansible.

## Alert rules

| Severity | Symptom |
| --- | --- |
| Critical | Tonem metrics scrape is down for 2 minutes |
| Critical | Collector has no successful completion for more than 3 minutes |
| Critical | Public `/health` stays unhealthy for 2 minutes; this covers all-crypto stale >5 minutes and an open MOEX group stale >10 minutes |
| Warning | A quote source fails during the last 5 minutes |
| Warning | One instrument exceeds its freshness limit while its market group is open |
| Warning | Grafana, Prometheus, or Loki fails 3 local watchdog checks |
| Warning | Postgres exporter, Umami, analytics backup, restore-check, frontend categories, or monitoring disk has a problem |
| Warning/Critical | Tonem master backup is older than 26/48 hours |

Telegram messages contain Russian human-readable text, severity/service, MSK and
UTC time, and a direct Tonem dashboard link. Grafana and the dashboard remain
private; anonymous access stays disabled.

## HetrixTools Free — manual prerequisite

The only intentionally manual phase-1 setup is the external account and monitors:

1. Create a dedicated HetrixTools account and monitoring contact.
2. Add an HTTPS monitor for `https://tonem.ru/`.
3. Add an HTTPS monitor for `https://api.tonem.ru/health` and accept only `2xx`.
4. Set both monitors to a 1-minute interval and alert after 3 consecutive failures.
5. Enable Telegram down/recovery notifications to the dedicated private monitoring
   chat. Do not configure an email contact.
6. Keep maintenance manual initially. Every window must have an explicit end time;
   never create an indefinite mute.
7. Run a controlled check by temporarily testing a known failing URL, confirm one
   incident and one recovery message, then restore the real URL.

After several successful deployments, automate a maintenance window capped at 10
minutes, always close it, and run the post-deploy `/health` check. Deployment errors
must remain visible.

## Validation and rollout

Local validation:

```bash
npm run test:tonem-server
npm run build:tonem-server
ansible-playbook --syntax-check infra/ansible/playbooks/site.yml
```

Production dry-run, after private variables exist:

```bash
tools/ansible/run_prod_private.sh --playbook monitoring --check --limit master
npm run deploy:tonem:check
npm run ansible:master:check
npm run ansible:tonem-analytics:check
```

Before production approval, verify the dry-run shows only the expected Tonem and
monitoring changes. After an approved deploy, check `/live`, `/ready`, `/health`,
the `tonem_server` target in Prometheus, the Tonem Grafana dashboard, Telegram test
notification, watchdog timer, and both external monitors.

Prometheus and Loki retain seven days locally; Prometheus also has a 4 GB hard cap.
Their daily consistent snapshots are stored in Restic S3. The
disk alert evaluates only the master root filesystem, avoiding false positives
from small system mounts. Increase either retention window only after reviewing
measured volume growth and available disk space.
