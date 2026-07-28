# tonem-server

NestJS backend for [tonem.ru](https://tonem.ru). Collects live quotes 24/7 into
Postgres so history can be served later (time-machine, sparklines). Separate
from the Angular frontend (`apps/tonem`), which polls quotes browser-direct.

- **Collector** (`collector.service.ts`) — cron every minute; MOEX ISS
  (currency batch, index, futures board RFUD) during MSK trading windows,
  Binance REST for crypto 24/7. Idempotent upserts keyed on `(instrument, ts)`.
- **Read API** (`quotes.controller.ts`) — `GET /latest`, `GET /at`,
  `GET /range`. CORS limited to tonem.ru origins.
- **Persistence** — Prisma (`prisma/schema.prisma`), model `Tick`.

See `deployments/tonem/README.md` for database setup, migrations, Docker, and
the nginx `api.tonem.ru` block.

## Develop

```bash
npm --workspace tonem-server run prisma:generate
npm --workspace tonem-server run build
npm --workspace tonem-server run test
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tonem" \
  npm --workspace tonem-server run start:dev
```
