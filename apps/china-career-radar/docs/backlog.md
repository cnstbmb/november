# Исполняемый backlog

- [x] Spec, constitution, research, contracts и data model.
- [x] Workspace, validated configuration, profiles, prompts и source policies.
- [x] PostgreSQL schema/migrations и idempotency constraints.
- [x] Fixture/manual-text pipeline, normalization, hard filters, Mock analyzer и ConsoleNotifier.
- [x] DeepSeek Responses adapter со strict validation и bounded retry.
- [x] ChinaJob fixture parser и centralized SSRF-safe fetcher.
- [x] pg-boss lifecycle, queue и dead-letter policy.
- [x] Telegram allowlist, cards, callbacks, feedback и applications.
- [x] Health, Docker Compose, README и offline test suite.
- [x] Реализовать Telegram handlers `/add`, `/addtext`, `/latest` и policy-gated manual URL ingestion.
- [x] Подключить автоматическое Brave discovery для обоих профилей и публичные Lever/Greenhouse/Ashby/SmartRecruiters Job APIs.
- [ ] Расширить Telegram UX подтверждениями, пагинацией и восстановлением незавершённого `/addtext` после рестарта.
- [ ] Добавить PostgreSQL integration suite в CI с service container.
- [ ] Получить письменное разрешение ChinaJob либо оставить источник fixture/manual-only.
- [ ] После стабилизации источников реализовать Family Opportunity Bundle и school research отдельной фазой.
