# China Career Radar

Личный сервис для безопасного сбора и оценки вакансий в Mainland China под два семейных профиля: `cnstbmb` и `lanok`. Он хранит исходный материал, нормализует и дедуплицирует вакансии, применяет дешёвые hard filters, выполняет валидируемый анализ и отправляет подходящие результаты через ConsoleNotifier или Telegram.

## Что работает

- fixture и manual-text ingestion;
- автоматическое обнаружение через Brave Search с загрузкой полного текста из официальных публичных Lever, Greenhouse, Ashby и SmartRecruiters API;
- policy-gated manual URL: неизвестные/неразрешённые домены сохраняются как `pending_manual` без запроса;
- ChinaJob parser на локальных fixtures; live-режим выключен;
- нормализация URL, текста, зарплаты, режима работы, языков, visa/relocation/housing evidence и нескольких tracks;
- ordered identity и immutable Job Versions;
- pg_trgm Possible Duplicate records без автоматического merge;
- versioned candidate profiles и hard-filter outcomes;
- MockJobAnalyzer по умолчанию;
- DeepSeek Responses API `json_schema`, Zod и локальная policy overlay;
- ConsoleNotifier, Telegram allowlists/callbacks, feedback и applications;
- PostgreSQL migrations, pg-boss queue/DLQ lifecycle, run statistics и health endpoints;
- Docker Compose для PostgreSQL и приложения.

## Ограничения MVP

- Нет Angular/UI.
- ChinaJob и прочие внешние площадки не опрашиваются live без явного разрешения.
- Прямой live-обход Zhipin, Liepin, 51job, Zhaopin, Lagou, Maimai, WeChat и ChinaJob не выполняется.
- Telegram поддерживает рабочие `/search`, `/searchstatus`, `/addtext`, `/latest`, `/add` и callback-действия; расширенный conversational UX остаётся следующим небольшим срезом.
- Family Opportunity Bundle и подбор школ пока не вычисляются.
- Admin API должен оставаться на loopback/private Docker network.
- Это risk triage, а не юридическая консультация или решение о Work Permit.

## Откуда берутся вакансии сейчас

- `Brave Search` — восемь поисковых запросов за запуск: отдельные software и education/admin планы по Lever, Greenhouse, Ashby и SmartRecruiters. Сниппеты Brave не сохраняются и не выдаются за вакансии.
- `Lever`, `Greenhouse`, `Ashby` и `SmartRecruiters` — полный текст найденных объявлений загружается из официальных публичных API и проходит общий ingestion для обоих профилей.
- `manual_text` — конкретный текст вакансии, присланный через Telegram `/addtext` или CLI.
- `manual_url` — URL загружается только для источника, чья policy явно разрешает live/manual URL; неизвестные и неразрешённые URL сохраняются как `pending_manual` без HTTP-запроса.
- `ChinaJob` — только сохранённые тестовые fixtures; live-сбор выключен.
- Zhipin, Liepin, 51job, Zhaopin, Lagou, Maimai и WeChat — прямой live-сбор выключен; их защита и приватные API не обходятся.

Автопоиск запускается после старта и каждые 6 часов. Команда Telegram `/search` запускает его вручную, `/searchstatus` показывает последний результат, `/sources` — статус источников. `/addtext` не запускает поиск: поисковый бриф отклоняется с пояснением, а конкретное объявление проходит обычный ingestion.

## Где хранятся данные

Production PostgreSQL хранит разные уровни раздельно:

- `raw_jobs` — ограниченный исходный текст/HTML как Raw Snapshot;
- `jobs` — каноническая вакансия и её текущий lifecycle status;
- `job_versions` — неизменяемые версии существенного содержимого;
- `job_analyses` — отдельные оценки версий для Candidate Profiles;
- `telegram_deliveries` — доставки карточек;
- `user_feedback` — текущее `interested`/`dismissed`/`applied` по кандидату и вакансии;
- `applications` — состояние отклика;
- `source_runs` и `pending_manual_leads` — работа источников и URL, ожидающие ручной проверки.

На Moscow база находится в Docker volume стека China Career Radar; PostgreSQL наружу не публикуется. Карточка показывает человекочитаемый источник и ID вакансии для трассировки.

## Требования

- Node.js 24 LTS (`nvm use` внутри каталога приложения)
- npm
- Docker Compose v2 для полного локального сценария

## Установка

Из корня монорепозитория:

```bash
nvm use 24
npm install
cp apps/china-career-radar/.env.example apps/china-career-radar/.env
```

## Быстрый локальный запуск

```bash
cd apps/china-career-radar
docker compose up -d postgres
npm run db:migrate
npm run demo
npm run start:dev
```

Проверка:

```bash
curl --fail http://127.0.0.1:3100/health/live
curl --fail http://127.0.0.1:3100/health/ready
```

Повторный `npm run demo` должен вернуть ту же версию без нового анализа. Изменённый fixture:

```bash
npm run radar -- demo --fixture chinajob-senior-frontend-updated
```

## Docker Compose

```bash
cd apps/china-career-radar
cp .env.example .env
docker compose up --build
```

PostgreSQL публикуется только на `127.0.0.1:5438`, приложение — только на `127.0.0.1:3100`. В реальном DC порт приложения следует оставлять во внутренней сети или закрывать firewall/reverse proxy authentication.

## Миграции

Schema находится в `src/database/schema.ts`, SQL — в `database/migrations/`.

```bash
npm run db:generate
npm run db:migrate
```

В production используется только reviewable generate/migrate flow; `drizzle-kit push` не применяется. pg-boss владеет отдельной схемой `pgboss` и мигрирует её при старте queue service.

## CLI

```bash
npm run radar -- demo
npm run radar -- add-text --file test/fixtures/manual/software-job.txt
npm run radar -- add-url https://unknown.example/job/1
npm run radar -- stats
npm run radar -- profile cnstbmb
```

`add-url` не делает HTTP-запрос для неизвестного, выключенного или неутверждённого домена: ссылка сохраняется как `pending_manual` с причиной. Для источника с `manual_url`, `policyStatus: approved` и `live.enabled: true` URL проходит SSRF-защищённую загрузку и обычный ingestion pipeline.

## Mock и DeepSeek

Mock включён по умолчанию:

```dotenv
ANALYZER_PROVIDER=mock
```

Для DeepSeek:

```dotenv
ANALYZER_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_MODEL_REVISION=deepseek-v4-flash@2026-07-31
ANALYSIS_PROMPT_VERSION=v1
BRAVE_SEARCH_API_KEY=...
DISCOVERY_ENABLED=true
DISCOVERY_RUN_ON_STARTUP=true
DISCOVERY_INTERVAL_MINUTES=360
```

Модели отправляется только redacted vacancy и минимальная capability projection. Не отправляются candidate ID, гражданство/immigration status, контакты, университет, Telegram IDs, данные ребёнка или семейная логистика. Ответ принимается только после envelope validation, JSON parse, strict Zod, evidence check и локальных Work Permit/verdict правил. Битые ответы ограниченно повторяются и никогда не публикуются.

## Telegram

1. Создайте бота через BotFather.
2. Запишите токен только в environment/secrets.
3. Укажите allowlist чатов и отображение пользователей на профили:

```dotenv
TELEGRAM_BOT_TOKEN=...
TELEGRAM_POLLING_ENABLED=true
TELEGRAM_ALLOWED_CHAT_IDS=-1001234567890
TELEGRAM_USER_PROFILE_MAP=111111=cnstbmb,222222=lanok,333333=cnstbmb|lanok
```

Проверка user ID и chat ID выполняется до обработки команды/callback. Без токена приложение запускается нормально и использует ConsoleNotifier для pipeline.

Команды MVP: `/start`, `/help`, `/search`, `/searchstatus`, `/add`, `/addtext`, `/latest`, `/stats`, `/profile`, `/sources`. Callback actions: Интересно, Мимо, Откликнулся, Закрыта. Feedback и Application upsert-ятся по уникальной candidate/job паре; Закрыта меняет глобальный Job. Callback обновляет текст карточки и выделяет текущее действие; после закрытия кнопки удаляются.

## SourceAdapter и новый источник

1. Добавьте строгий YAML в `config/sources/`.
2. Зафиксируйте allowed modes, terms/license evidence, robots observation, дату проверки, rate limits, hosts/redirect hosts, network limits и egress policy.
3. Реализуйте transport-free parser и `SourceAdapter`.
4. Произвольные URL передавайте только через `SafeHttpFetcher`. Для документированного API допустим отдельный клиент только с фиксированным allowlisted host, bounded timeout/body и schema validation.
5. Добавьте минимизированные fixtures, manifest и contract tests.
6. Не включайте live до явного operator/legal approval.

Подробности: [source policy](docs/source-policy.md) и [архитектура](docs/architecture.md).

## Тесты и quality gates

```bash
npm run format:check
npm run typecheck
npm test
npm run build
```

Default tests не ходят в ChinaJob, DeepSeek или Telegram. Live-проверки могут существовать только под явными флагами `LIVE_SOURCE_TESTS=1` и `LIVE_DEEPSEEK_TESTS=1` с синтетическими неперсональными данными.

## DC и будущий home worker

Основной x86_64 DC запускает приложение и PostgreSQL и не зависит от домашнего устройства. `WorkerLocation` уже принимает `local`, `dc`, `home`, а source policy содержит egress choice. NanoPi может позднее стать отдельным разрешённым collector/egress worker через WireGuard, но маршрутизация через домашний IP, ARM-specific runtime и failover dependency в MVP отсутствуют.

## Безопасность

- секреты только через environment/secrets;
- raw snapshots и request bodies не логируются;
- admin API требует `X-Internal-Token` и не должен публиковаться наружу;
- URL fetch блокирует unsafe scheme/host/port/IP/redirect, ограничивает MIME, время и 1 MiB body;
- нет CAPTCHA bypass, fingerprint spoofing, evasive proxy rotation, private API reverse engineering или чужих сессий;
- recruiter email/phone redacted перед внешним анализом.

## Документы

- Spec Kit: `../../specs/001-china-career-radar/`
- Domain language: `CONTEXT.md`
- ADR: `docs/adr/`
- Architecture: `docs/architecture.md`
- Source governance: `docs/source-policy.md`
