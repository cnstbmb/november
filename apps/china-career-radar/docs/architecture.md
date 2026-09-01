# Архитектура

China Career Radar — модульный монолит. Один процесс NestJS обслуживает приватный HTTP control plane, pg-boss workers/scheduler и Telegram long polling; отдельным обязательным контейнером остаётся PostgreSQL. Модули связаны через `SourceAdapter`, `DocumentFetcher`, `JobAnalyzer`, `Notifier` и repository contracts.

Поток данных: Brave Search (transient URL discovery) → fixed-host Lever/Greenhouse/Ashby/SmartRecruiters public API → SourceAdapter → Raw Job → deterministic normalization → ordered deduplication → immutable Job Version → per-profile hard filters → validated analysis → idempotent delivery/feedback. Поисковые snippets не сохраняются; source snapshot начинается с ответа официального ATS API.

DC полностью самодостаточен. `WorkerLocation` и egress policy допускают будущий home worker, но маршрутизация через домашний IP, ARM-зависимости и anti-bot механизмы отсутствуют. Family Opportunity Bundle будет вычисляться поверх city-normalized jobs и candidate analyses; отдельные пустые таблицы в MVP не создаются.

См. ADR в `docs/adr/` и полный design в `specs/001-china-career-radar/`.
