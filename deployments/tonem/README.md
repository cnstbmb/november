# tonem.ru deployment

Self-contained Docker Compose stack for [tonem.ru](https://tonem.ru):

- **tonem-postgres** — dedicated Postgres 17 database for tonem data
- **tonem-server** — NestJS collector (MOEX ISS + Binance → DB) + public JSON read API
- **tonem-web** — nginx serving the Angular SPA for tonem.ru / www.tonem.ru

All three services live in `deployments/tonem/docker-compose.yml`. The stack is
independent of the prod compose **except** for one shared network (`remnawave-network`)
that lets the prod nginx proxy to `tonem-web` and `tonem-server` by container name.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ tonem-network (internal bridge)                      │
│  ┌─────────────────┐    ┌──────────────────┐        │
│  │ tonem-postgres  │◀───│  tonem-server    │        │
│  │   :5432         │    │   :3200          │        │
│  └─────────────────┘    └────────┬─────────┘        │
│                                  │                   │
├──────────────────────────────────┼───────────────────┤
│ remnawave-network (external, shared w/ proxy)        │
│                                  │                   │
│  ┌─────────────────┐    ┌───────▼──────────┐        │
│  │  tonem-web      │    │  tonem-server    │        │
│  │   :80           │    │   :3200          │        │
│  └────────┬────────┘    └────────┬─────────┘        │
│           │                      │                   │
│  ┌────────▼──────────────────────▼─────────┐        │
│  │  prod webserver (nginx :443)            │        │
│  │  tonem.ru → tonem-web:80               │        │
│  │  api.tonem.ru → tonem-server:3200       │        │
│  └─────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────┘
```

---

## Quick start (production)

### 1. Set secrets

```bash
# Edit deployments/tonem/.env — set a real password:
TONEM_POSTGRES_PASSWORD=<strong-random-password>
```

### 2. Build and push images (from your workstation)

```bash
npm run build:tonem:prod
```

This builds `cnstbmb/tonem-server:latest` and `cnstbmb/tonem-web:latest` and
pushes them to Docker Hub.

### 3. Deploy via Ansible

```bash
npm run deploy:tonem        # full deploy
npm run deploy:tonem:check  # dry-run
```

The playbook:
- Copies `docker-compose.yml` + `.env` to `/opt/tonem/` on the master host
- Copies the updated `nginx.conf` (with tonem.ru server blocks) to `/srv/nginx-conf/`
- Pulls images, starts the stack, reloads nginx

### 4. First-time DNS + TLS

Before the first deploy, set up DNS for:

- `tonem.ru` / `www.tonem.ru` → master host IP
- `api.tonem.ru` → master host IP

After DNS resolves, run certbot on the master to issue TLS certs:

```bash
docker exec webserver certbot --nginx -d tonem.ru -d www.tonem.ru
docker exec webserver certbot --nginx -d api.tonem.ru
```

---

## Manual deploy (without Ansible)

```bash
# On the server, after copying compose + env to /opt/tonem/:
cd /opt/tonem
docker compose pull
docker compose up -d
docker compose logs -f
```

---

## Local development

### tonem-server

```bash
# Start a local postgres:
docker run -d --name pg-tonem -p 5432:5432 \
  -e POSTGRES_USER=tonem -e POSTGRES_PASSWORD=tonem -e POSTGRES_DB=tonem \
  postgres:17-alpine

# Run the collector locally:
DATABASE_URL="postgresql://tonem:tonem@localhost:5432/tonem" \
PORT=3200 \
  npm --workspace tonem-server run start:dev
```

First time: `npm --workspace tonem-server run prisma:migrate:dev` to apply migrations.

### tonem frontend

```bash
npm --workspace tonem run start
# Opens http://localhost:4200
```

The dev server proxies `/api` to `http://localhost:3200` (the local tonem-server).

---

## Read API

| Endpoint | Description |
| --- | --- |
| `GET /latest` | Most recent tick per instrument |
| `GET /at?ts=<iso>[&instrument=<id>]` | Nearest tick ≤ timestamp |
| `GET /range?from=<iso>&to=<iso>&instrument=<id>` | Ticks in range |
| `GET /live` | Process liveness only |
| `GET /ready` | Postgres readiness, without dependency details |
| `GET /health` | Public aggregate collector and quote freshness status |
| `GET /metrics` | Prometheus metrics; private monitoring network only in production |
| `POST /client-telemetry` | Strictly bounded aggregate frontend error categories |

Production base URL: `https://api.tonem.ru`

---

## Files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | tonem-postgres + tonem-server + tonem-web |
| `Dockerfile.frontend` | Multi-stage build: Angular → nginx |
| `nginx/tonem.conf` | SPA nginx config (fallback + cache + gzip) |
| `.env` | Secrets — **git-ignored** |
| `README.md` | This file |
| `OBSERVABILITY.md` | Monitoring, Telegram alerts, backups, Umami privacy and rollout runbook |
| `analytics-config.js` | Fail-open disabled runtime config; Ansible overrides it in production |

Server Dockerfile: `apps/tonem-server/Dockerfile` (multi-stage: build → Prisma migrate + start)
