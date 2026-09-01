# Implementation Plan: China Career Radar MVP

**Branch**: `codex/001-china-career-radar` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-china-career-radar/spec.md`

## Summary

Build a private NestJS modular monolith that turns fixture, manual-text, and policy-approved manual-URL inputs into immutable normalized job versions, deterministic per-profile filter results, validated mock or DeepSeek analyses, PostgreSQL records, and console or Telegram notifications. PostgreSQL is also the durable queue store through pg-boss. All URL retrieval fails closed through source policy and SSRF controls; ChinaJob is fixture-only.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 24 LTS  
**Primary Dependencies**: NestJS 11, Drizzle ORM, node-postgres, pg-boss 12, Zod, YAML, Cheerio, Undici, grammY 1.x  
**Storage**: PostgreSQL 18 with `pg_trgm`; application tables plus pg-boss-owned queue schema  
**Testing**: Jest 30 + ts-jest, offline unit/contract tests, opt-in PostgreSQL and live-provider tests  
**Target Platform**: x86_64 Linux in Docker Compose; macOS/Linux developer host; optional future ARM collector  
**Project Type**: Private backend service with CLI and Telegram control surfaces  
**Performance Goals**: Manual/fixture ingestion acknowledged within 2 seconds; mock vertical flow completes within 10 seconds; normal health response within 250 ms; bounded source and model concurrency  
**Constraints**: One required datastore; no public admin API; no external credentials for default run/tests; 1 MiB raw input/fetch cap; 10-second fetch and 90-second model deadlines; strict idempotency; no unapproved live source access  
**Scale/Scope**: Two candidate profiles, tens of source policies, up to tens of thousands of job versions, low single-digit concurrent workers, one family deployment

No `NEEDS CLARIFICATION` items remain.

## Constitution Check

*GATE: evaluated before research and re-evaluated after design.*

| Gate | Pre-research | Post-design evidence |
|---|---|---|
| Governed Sources Only | PASS | Strict source-policy contract; ChinaJob fixture-only; no adapter owns unrestricted network access |
| Evidence Before Inference | PASS | Raw snapshots and immutable versions are separate; analysis schema requires evidence; local Work Permit overlay |
| Idempotent, Versioned Workflows | PASS | Unique keys for job versions, analyses, deliveries, feedback, applications, and source leads |
| Private and Minimal by Default | PASS | Loopback/private API, Telegram allowlists, analyzer capability projection, secret-safe logging |
| Simple, Observable, and Testable | PASS | One app container plus PostgreSQL; adapter contracts, correlation IDs, run statistics, offline tests |
| URL safety constraints | PASS | Central fetch contract with policy, DNS/IP, pinned connection, redirect, MIME, timeout, and size gates |
| No home-worker dependency | PASS | `WorkerLocation` is metadata; all MVP paths run as `local` or `dc` |

No constitution violations require exception tracking.

## Architecture and module boundaries

- **ConfigModule** validates environment, profile YAML, source policies, prompt versions, and query recipes.
- **DatabaseModule** owns the pool, Drizzle client, migrations, repository implementations, and transaction boundaries.
- **ProfilesModule** loads profile definitions, derives privacy-safe capability projections, and creates immutable versions.
- **SourcesModule** owns source policies, adapters, fixture fetchers, and the single guarded network fetcher.
- **IngestionModule** orchestrates source runs and raw-job admission.
- **NormalizationModule** contains deterministic canonical URL, text, salary, location, and track normalization.
- **DeduplicationModule** resolves deterministic identity and records similarity candidates without auto-merging.
- **FilteringModule** evaluates versioned candidate policies and persists reason codes.
- **AnalysisModule** owns analyzer contracts, mock/DeepSeek implementations, schemas, policy overlay, retry classification, and prompt versions.
- **NotificationsModule** owns notifier contracts, formatting, console delivery, and delivery idempotency.
- **TelegramModule** owns grammY polling, allowlists, commands, callbacks, and interactive manual-text state.
- **FeedbackModule** owns candidate feedback, applications, and global close behavior.
- **SchedulerModule** owns pg-boss lifecycle, queues, schedules, and dead-letter configuration.
- **HealthModule** exposes non-diagnostic liveness/readiness.

Dependencies point inward toward pure contracts and domain functions. Source adapters cannot access transport except through `DocumentFetcher`; analyzers cannot persist or notify; notifiers consume only trusted analyses; queue handlers invoke application services.

## Project Structure

### Documentation

```text
specs/001-china-career-radar/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── contracts/
    ├── adapters.md
    ├── analysis.schema.json
    ├── cli.md
    ├── openapi.yaml
    └── telegram.md
```

### Source Code

```text
apps/china-career-radar/
├── config/
│   ├── profiles/
│   ├── prompts/job-analysis/
│   ├── queries/
│   └── sources/
├── database/
│   └── migrations/
├── src/
│   ├── analysis/
│   ├── config/
│   ├── database/
│   ├── feedback/
│   ├── filtering/
│   ├── health/
│   ├── ingestion/
│   ├── jobs/
│   ├── normalization/
│   ├── notifications/
│   ├── profiles/
│   ├── scheduler/
│   ├── sources/
│   ├── telegram/
│   ├── app.module.ts
│   ├── cli.ts
│   └── main.ts
├── test/
│   ├── fixtures/chinajob/
│   ├── integration/
│   └── unit/
├── compose.yaml
├── Dockerfile
├── drizzle.config.ts
├── jest.config.ts
├── package.json
└── README.md
```

**Structure Decision**: Add one isolated npm workspace under `apps/`. Keep runtime, database, configuration, fixtures, and deployment artifacts app-local. Do not touch the production `deployments/**` or Ansible trees in this feature.

## Delivery sequence

1. Establish package, configuration schemas, database schema/migration, and pure domain contracts.
2. Implement fixture/manual-text normalization, identity/version persistence, profile filters, mock analysis, and console notification.
3. Add source policies, Pending Manual Lead handling, SSRF-safe manual URL path, and ChinaJob fixture parser.
4. Add strict analysis schema, DeepSeek Responses adapter, bounded failure classification, and pg-boss queues/DLQ.
5. Add grammY commands, candidate-aware allowlists, cards, callbacks, feedback, and applications.
6. Add health, source-run statistics, Compose, documentation, offline tests, and optional integration/live test gates.

## Complexity Tracking

No constitution violations.
