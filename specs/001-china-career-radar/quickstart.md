# Quickstart Validation Guide

This guide validates the planned MVP end to end. Detailed operator documentation lives in `apps/china-career-radar/README.md` after implementation.

## Prerequisites

- Node.js 24 LTS and npm
- Docker with Compose v2
- Free loopback ports 3100 and 5438

External model and Telegram credentials are not required for the default path.

## Start storage and apply migrations

```bash
cd apps/china-career-radar
cp .env.example .env
docker compose up -d postgres
npm run db:migrate
```

Expected: PostgreSQL reports healthy and the application migration plus `pg_trgm` extension is present.

## Run the fixture vertical scenario

```bash
npm run radar -- demo
```

Expected:

- a ChinaJob fixture is parsed without network access;
- the raw snapshot, canonical job, first job version, per-profile filter results, and applicable mock analyses are persisted;
- qualifying results are printed by ConsoleNotifier;
- the command exits successfully with job/version/analysis identifiers.

Run it again:

```bash
npm run radar -- demo
```

Expected: the same canonical job and version are returned; analysis and delivery counts do not increase.

## Validate a changed version

```bash
npm run radar -- demo --fixture chinajob-senior-frontend-updated
```

Expected: the canonical job is reused, one new version is created, and applicable candidate analyses are recalculated.

## Run the service

```bash
docker compose up --build app
curl --fail http://127.0.0.1:3100/health/live
curl --fail http://127.0.0.1:3100/health/ready
```

Expected liveness body: `{"status":"ok"}`. Readiness becomes successful only when PostgreSQL and queue initialization are ready.

## Manual text and URL policy

```bash
npm run radar -- add-text --file test/fixtures/manual/software-job.txt
npm run radar -- add-url https://example.invalid/job/123
```

Expected: text enters the normal pipeline. The unknown URL is retained as a Pending Manual Lead and no DNS or HTTP request is made.

## Optional integrations

DeepSeek requires `ANALYZER_PROVIDER=deepseek` and `DEEPSEEK_API_KEY`. Telegram requires a bot token, allowlisted user IDs, destination chats, and profile mappings. With either absent, mock/console behavior remains healthy.

Live tests require explicit opt-in flags and synthetic, non-personal data:

```bash
LIVE_DEEPSEEK_TESTS=1 npm run test:live:deepseek
LIVE_SOURCE_TESTS=1 npm run test:live:sources
```

ChinaJob has no enabled live test until its source policy records affirmative permission.

## Quality gates

```bash
npm run format:check
npm run typecheck
npm test
npm run build
```

All default tests must pass with outbound source/model/Telegram networking disabled.

Related design: [data model](./data-model.md), [adapter contracts](./contracts/adapters.md), [CLI](./contracts/cli.md), [Telegram](./contracts/telegram.md), and [internal API](./contracts/openapi.yaml).
