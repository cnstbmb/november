# TONEM XHTTP camouflage rollout

This runbook implements the approved XHTTP-only migration. It does not change
Reality self-steal and it does not claim anonymity against targeted attribution.

## Public shape

| Target | Public origin | Transport |
| --- | --- | --- |
| Moscow | `live.tonem.ru` | XHTTP `stream-one` |
| HOME | `app.tonem.ru` | XHTTP `packet-up` |
| EXIT | `terminal.tonem.ru` | Enabled only when preflight proves live XHTTP |

`tonem.ru` and `www.tonem.ru` remain behind Cloudflare. Transport origins use
direct DNS-only `A` records, no `AAAA`, local HTTP-01 certificates, local TONEM
facades, no access logs, no analytics, and no client telemetry.

## Safety invariants

- Secret paths exist only in `.private/ansible/prod/remnawave-tonem-xhttp.json`.
- Every new path has at least 128 bits of entropy and a dedicated backend port.
- HOME/EXIT backends are loopback-only. Moscow is reachable only from the
  Remnawave nginx Docker bridge.
- A canary inbound, Host, squad, and monitoring user must work before cutover.
- Production squads retain both inbounds for 14 days. New subscriptions emit
  only the TONEM Host; previously saved links continue through the legacy inbound.
- Control-plane backups are AES-256-GCM encrypted. The local key is stored at
  `.private/keys/tonem-xhttp-backup.key` with mode `0600`.
- Retirement is time-gated and removes the legacy inbound only after 14 days.

## Prepare private state

```bash
npm run remnawave:tonem-xhttp:prepare
```

Then edit the private file without printing it. Configure:

- `publicIpv4` for every enabled target;
- `canaryUserShortUuid` for Moscow and HOME;
- Moscow `productionSquadNames` after the read-only state check;
- confirm Moscow `dockerBridgeCidr` matches the live `remnawave-network` subnet
  (the role refuses to alter UFW when it differs);
- `inventoryTarget` for any enabled non-default EXIT target;
- HOME `inventoryTarget` is the concrete inventory host `home.himenkov.ru`
  (not the absent public-template group `home_node`);
- EXIT legacy metadata only if its live inbound is XHTTP.

Validate without revealing paths:

```bash
npm run remnawave:tonem-xhttp:config:check
npm run remnawave:tonem-xhttp:config:ready
npm run remnawave:tonem-xhttp:test
```

`config:check` validates schema and safety invariants. `config:ready` additionally
requires public IPv4 addresses, the private canary monitoring user short UUID,
and production squad names for every enabled target. The sequential updater runs
the same readiness gate before invoking Ansible.

## DNS and certificates

The Cloudflare API token is supplied only on the controller:

```bash
CLOUDFLARE_API_TOKEN=... npm run remnawave:tonem-xhttp:dns:check
CLOUDFLARE_API_TOKEN=... npm run remnawave:tonem-xhttp:dns:apply
```

The DNS reconciler forces `proxied=false`, creates exactly one `A`, and deletes
duplicate `A` and all `AAAA` records. Edge roles use an HTTP-only nginx bootstrap
for the first HTTP-01 certificate; no Cloudflare token is copied to a node.

## Canary lifecycle

All mutating reconciler stages require the explicit `--apply` flag:

```bash
node tools/ansible/remnawave/reconcile_tonem_xhttp.mjs --target moscow --stage check
node tools/ansible/remnawave/reconcile_tonem_xhttp.mjs --target moscow --stage prepare-canary --apply
```

Deploy the facades only after the second inbounds are prepared. The rollout
runner always uses `moscow -> home -> exit`, skips disabled EXIT, health-gates
each target, and stops before the next target on any failure:

```bash
npm run remnawave:tonem-xhttp:update:check
npm run remnawave:tonem-xhttp:update
```

HOME/edge turns request the sudo password interactively through Ansible; the
password is never written to config, command arguments, or logs.

Each role pulls the configured `latest` image immediately before its turn and
tags the running image digest locally. A failed nginx, TLS, facade, or HTTP audit
restores the previous configuration and image; the sequential runner then exits.
The runner first applies the Remnawave proxy extension that mounts the private
server fragments and the HTTP-01 webroot; the master role refuses to continue
unless both mounts are visible in the running proxy container.

The canary subscription must pass:

- TLS and normal TONEM root/assets;
- exact API CORS, disabled telemetry/analytics, and `X-Robots-Tag: noindex`;
- real traffic in Shadowrocket and Happ Plus;
- xray-checker status and latency for the canary Host.

After both clients pass:

```bash
node tools/ansible/remnawave/reconcile_tonem_xhttp.mjs --target moscow --stage approve-canary --apply
node tools/ansible/remnawave/reconcile_tonem_xhttp.mjs --target moscow --stage cutover --apply
```

Repeat for HOME, then conditional EXIT. Run the facade audit without exposing the
secret path:

```bash
npm run remnawave:tonem-xhttp:audit
```

After the recorded 14-day overlap:

```bash
node tools/ansible/remnawave/reconcile_tonem_xhttp.mjs --target moscow --stage retire --apply
```

Run the relevant Ansible role again after retirement so legacy edge vhosts are
removed from nginx. Every mutating reconciler run automatically destroys encrypted
rollback files older than the configured 30-day retention window.
