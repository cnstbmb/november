# tonem.ru deployment

Stack for [tonem.ru](https://tonem.ru):

- **tonem-server** (T08) — NestJS service that collects MOEX ISS +
  Binance quotes 24/7 into Postgres and serves a public JSON read API.
- **tonem frontend** (`tonem-web`, T07) — nginx static site serving the
  Angular app for tonem.ru / www.tonem.ru.

Both live in `docker-compose.yml` in this directory. Each service block is
clearly marked; add your own block, don't rewrite the other.

---

## tonem-server

### What it does

- Once per minute writes one `Tick` per **LIVE** instrument (the 14 live
  instruments from the frontend registry; the 6 derived ones are computed
  client-side and not stored).
- **MOEX** instruments (fx / index / futures) are polled only during their MSK
  trading windows. **Crypto** (BTC/ETH/TON via Binance REST) is collected 24/7.
- Writes are **idempotent**: upsert on the unique `(instrument, ts)` key, with
  `ts` normalized to the start of the minute — a container restart re-using the
  same minute neither duplicates nor crashes.

### Read API (public, JSON)

Base URL in production: `https://api.tonem.ru`

| Endpoint | Description |
| --- | --- |
| `GET /latest` | Most recent tick per instrument. Returns `{ "<id>": { ts, value, meta } }`. |
| `GET /at?ts=<iso>[&instrument=<id>]` | For each instrument, the nearest tick with `ts <= <iso>`. With `instrument`, just that one. Missing → `null`. |
| `GET /range?from=<iso>&to=<iso>&instrument=<id>` | Ticks for one instrument in `[from, to]`, ascending. |

CORS is restricted to `https://tonem.ru` and `https://www.tonem.ru`.

---

## 1. Create the `tonem` database

tonem-server uses a **new** database named `tonem` on the **existing** shared
`postgres-db` container (postgres:17) from `deployments/prod`. It does **not**
run its own postgres.

Connect to the running postgres and create the database (owner = the existing
app user so `DATABASE_URL` can reuse those credentials):

```bash
docker exec -it postgres-db \
  psql -U november_app -d postgres -c "CREATE DATABASE tonem;"
```

(If your `POSTGRES_USER` differs, use that. Credentials live in
`deployments/prod/database.env`.)

---

## 2. Configure environment

```bash
cp ../../apps/tonem-server/.env.example .env
# edit .env — set DATABASE_URL to point at the tonem DB on postgres-db
```

`DATABASE_URL` format:

```
postgresql://november_app:<password>@postgres-db:5432/tonem
```

`postgres-db` resolves because `tonem-server` joins the existing prod
`app-network` (external). If on your host the prod network is actually named
`prod_app-network`, update `networks.app-network.name` in `docker-compose.yml`.

---

## 3. Run the migrations

The container applies migrations automatically on start
(`prisma migrate deploy && node dist/main.js`). To run them manually (e.g. from
your workstation against a reachable DB):

```bash
cd apps/tonem-server
DATABASE_URL="postgresql://november_app:<password>@<host>:5432/tonem" \
  npx prisma migrate deploy
```

The initial migration `0001_init` creates the `Tick` table plus its unique and
lookup indexes on `(instrument, ts)`.

---

## 4. Build & run with Docker

```bash
docker compose -f deployments/tonem/docker-compose.yml up -d --build tonem-server
docker compose -f deployments/tonem/docker-compose.yml logs -f tonem-server
```

The API listens on host port **3100** (`http://localhost:3100/latest`).

---

## 5. Run the collector locally (no Docker)

```bash
# from the repo root
npm install
npm --workspace tonem-server run prisma:generate
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tonem" \
PORT=3100 \
  npm --workspace tonem-server run start:dev
```

Useful root scripts:

```bash
npm run build:tonem-server   # tsc compile -> apps/tonem-server/dist
npm run start:tonem-server   # node dist/main.js
npm run test:tonem-server    # vitest unit tests
```

---

## 6. nginx — `api.tonem.ru`

Add this server block to the nginx config (`deployments/prod/nginx-conf/nginx.conf`).
It reverse-proxies the public API to the `tonem-server` container. The container
publishes `3100` on the host, so `127.0.0.1:3100` works regardless of docker
network topology; if nginx runs inside docker on `tonem-network`, you can instead
proxy to `http://tonem-server:3100`.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.tonem.ru;

    location ~ /.well-known/acme-challenge {
        allow all;
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_read_timeout 60s;
        proxy_connect_timeout 30s;
    }
}
```

### TLS

Once DNS for `api.tonem.ru` points at the host and the block above is live:

```bash
certbot --nginx -d api.tonem.ru
```

(The frontend `tonem.ru` / `www.tonem.ru` server block is in the next section.)

---

## tonem frontend (`tonem-web`)

nginx serving the built Angular SPA for **tonem.ru** / **www.tonem.ru**.

- **Image / build**: `deployments/tonem/Dockerfile.frontend` (multi-stage).
  Stage 1 runs `npm ci` + `npm run build:tonem` from the **repo root** (npm
  workspaces hoist deps to the root `node_modules`, same pattern as
  `apps/tonem-server/Dockerfile`). Stage 2 is `nginx:mainline-alpine` serving
  `apps/tonem/dist/tonem/browser` with `deployments/tonem/nginx/tonem.conf`.
- **Site config** (`nginx/tonem.conf`): SPA fallback
  (`try_files $uri $uri/ /index.html`), `index.html` → `Cache-Control:
  no-cache`, content-hashed bundles / media → `Cache-Control: public,
  max-age=31536000, immutable`, gzip on.
- **Container**: `tonem-web`, internal port **80** (no host port published),
  `restart: always`, on `tonem-network` + the shared `app-network`.

### Build & run

```bash
docker compose -f deployments/tonem/docker-compose.yml up -d --build tonem-web
docker compose -f deployments/tonem/docker-compose.yml logs -f tonem-web
```

Smoke-test without touching prod (publishes a host port just for the check):

```bash
docker run --rm -p 8081:80 cnstbmb/tonem-web:latest
# open http://localhost:8081  — /, SPA fallback, and /og-card.png should all 200
```

### How prod nginx reaches it

`tonem-web` joins the **external `app-network`** created by
`deployments/prod/docker-compose.yml` (the same network the `webserver`
container is on). The prod nginx therefore proxies to it **by container name**,
exactly like it already proxies `http://angular-app:8080`:

```
proxy_pass http://tonem-web;   # tonem-web listens on :80 inside app-network
```

> If on the host the prod network is actually named `prod_app-network`, update
> `networks.app-network.name` in `docker-compose.yml` (same note as
> tonem-server).

### nginx server block — add to `deployments/prod/nginx-conf/nginx.conf`

This block serves `tonem.ru` + `www.tonem.ru`. It includes the
`acme-challenge` location so certbot can issue/renew. Add it as a new `server
{}` block in that file (do **not** modify the existing konstantin.himenkov.ru
blocks).

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name tonem.ru www.tonem.ru;

    location ~ /.well-known/acme-challenge {
        allow all;
        root /var/www/html;
    }

    location / {
        proxy_pass http://tonem-web;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_read_timeout 60s;
        proxy_connect_timeout 30s;
    }
}
```

### TLS

Once DNS for `tonem.ru` and `www.tonem.ru` points at the host and the block
above is live (and `docker compose ... up -d tonem-web` is running):

```bash
certbot --nginx -d tonem.ru -d www.tonem.ru
```

certbot edits the block in place to add the 443 listener + LE certs and the
80→443 redirect.

### Cache-header behavior

- `index.html` is served with `Cache-Control: no-cache, no-store,
  must-revalidate` — browsers always revalidate it, so a new deploy is picked
  up immediately.
- Angular's production build sets `outputHashing: "all"`, so `main-<hash>.js`,
  `styles-<hash>.css`, and any media with a content hash get `Cache-Control:
  public, max-age=31536000, immutable` (1 year). Because `index.html` is never
  cached and references the new hashed filenames, rollouts are safe.
- `og-card.png` / `favicon.*` are static (not hashed); they currently fall
  under the 1-year media rule. If you change the card and want clients to see
  it fast, either bump the filename or accept the cache window.

### Yandex.Metrika

`apps/tonem/src/index.html` ships the standard async `mc.yandex.ru/metrika/tag.js`
snippet with a **placeholder counter ID `XXXXXXXX`** (3 occurrences: the script
URL, the `ym(...)` init call, and the `<noscript>` `<img>`). **The site owner
must replace every `XXXXXXXX` with the real counter ID from
https://metrika.yandex.ru** — do not commit a real ID you invented. The
placeholder is intentional.

### Donate footer ("кофе автору") — to drop into the app shell

The ticket asks for a small donate footer. The app layout
(`apps/tonem/src/app/app.html`) is owned by another ticket, so it is **not**
edited here. Drop this snippet into the app shell (e.g. under the `<footer
class="ticker">` in `app.html`, or wherever the layout agent prefers) and wire
the link to the real donate URL:

```html
<a class="donate" href="https://DONATE_URL_HERE" target="_blank" rel="noopener">
  ☕ кофе автору
</a>
```

```scss
.donate {
  position: fixed;
  right: 16px;
  bottom: 56px; // sit above the ticker strip
  font-size: 13px;
  color: var(--ink-dim);
  text-decoration: none;
  opacity: 0.7;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 1;
    color: var(--ink);
  }
}
```

> `https://DONATE_URL_HERE` is a **placeholder** — no donate URL is configured
> anywhere in the repo. The owner must supply the real link (Boosty /
> CloudTips / T-Bank / etc.). The styling uses the existing `--ink` /
> `--ink-dim` CSS vars from `apps/tonem/src/styles.scss` so it matches the app
> aesthetic out of the box.

---

## Files in this directory

| File | Owner | Purpose |
| --- | --- | --- |
| `docker-compose.yml` | shared (T08 + T07) | `tonem-server` + `tonem-web` services. |
| `Dockerfile.frontend` | T07 | multi-stage build → nginx static image for the Angular app. |
| `nginx/tonem.conf` | T07 | SPA site config inside the `tonem-web` image (fallback + cache + gzip). |
| `.env` | you (git-ignored) | `DATABASE_URL`, `PORT`. |
| `README.md` | T08 + T07 | this file. |

Static/meta assets for the frontend live in `apps/tonem/public/` (OG card,
favicons) and are generated from `apps/tonem/tools/og/` (see the README there).
The enriched `<head>` (OG/Twitter meta, theme-color, Yandex.Metrika) is in
`apps/tonem/src/index.html`.
