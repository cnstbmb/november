# Migrations

This directory follows the standard Prisma Migrate layout. Each subdirectory is
named `<timestamp>_<name>` and contains a `migration.sql`.

- `0001_init` — creates the `Tick` table with the unique + lookup indexes on
  `(instrument, ts)`.

Apply with:

```bash
DATABASE_URL="postgresql://USER:PASS@HOST:5432/tonem" npx prisma migrate deploy
```

(From `apps/tonem-server`, or via `npm --workspace tonem-server run prisma:migrate`.)
