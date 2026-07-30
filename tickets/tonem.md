# tonem.ru — тикеты

> Публичный «памятник рынку» в духе zenrus, но шире и живее: одна монументальная
> цифра-герой + тикер-лента; генеративные фон и звук, подчинённые настроению рынка;
> машина времени по истории котировок.
>
> **Домен:** tonem.ru (куплен ✅)
>
> ## Протокол решений (из гриль-сессии 2026-07-28)
>
> | Слой | Решение |
> |---|---|
> | Фронт | `apps/tonem` — Angular 21, standalone + signals, RxJS для потоков, zoneless, без PrimeNG/NgRx, спарклайн — ручной SVG, темы через CSS-переменные |
> | Бэк | `apps/tonem-server` — NestJS + Prisma: коллектор (таймер → MOEX/Binance) + read API `/latest` `/at` `/range` |
> | База | новая БД `tonem` на существующем postgres:17 (`deployments/prod`); бэкфилл из свечей MOEX/Binance |
> | Live-данные | browser-direct: MOEX ISS (FX, Brent, золото, IMOEX, сырьё), Binance WS (крипта), ЦБ РФ — фолбэк. Задержка ISS проверена: SYSTIME отстаёт от сделок <1 мин ✅ |
> | Инструменты (14 живых) | USD/RUB, EUR/RUB, CNY/RUB, Brent, золото (GLDRUB_TOM), IMOEX, BTC, ETH, TON + пшеница, АИ-95, кофе, апельсиновый сок, сахар (всё — MOEX FORTS/спот) |
> | Производные (~6) | EUR/USD, BTC/RUB, BTC-в-золоте, BTC-в-баррелях, «индекс завтрака» (кофе+сок+пшеница+сахар), рубль-в-граммах-золота. Не храним — считаем на лету |
> | Моушн | одометр + тающая вспышка зелёный/красный, агрегация тиков ~500мс, `prefers-reduced-motion` → тихий фейд |
> | Фон | генератив (canvas/WebGL), палитра = рыночное настроение (CSS-переменные `--mood-*`); медиа-паки — этап 2 |
> | Звук | генеративный WebAudio-эмбиент от настроения рынка, по умолчанию выкл (автоплей-блок), кнопка «включить звук»; нейро-лупы — этап 2 |
> | Настройки | localStorage + всё состояние в URL-хэше («поделиться видом») |
> | Деплой | `deployments/tonem/` на главном сервере; существующие nginx+certbot: `tonem.ru` → front, `api.tonem.ru` → server |
> | Вычеркнуто | динамические OG, музыка с авторскими правами, акции отдельных компаний |
>
> ## Реестр инструментов (источники)
>
> | Инструмент | Источник | Endpoint-тип |
> |---|---|---|
> | USD/RUB, EUR/RUB, CNY/RUB | MOEX ISS currency/selt CETS (`USD000UTSTOM` и т.д.) | REST поллинг |
> | Золото ₽/г | MOEX `GLDRUB_TOM` | REST поллинг |
> | IMOEX | MOEX stock/index | REST поллинг |
> | Brent, WTI, пшеница, АИ-92/95, кофе, какао, сок, сахар, газ | MOEX FORTS (`iss/engines/futures/markets/forts/...`) — выбрать ближайший ликвидный контракт по ASSETCODE | REST поллинг |
> | BTC, ETH, TON | Binance `stream.binance.com:9443` combined streams | WebSocket |
> | Фолбэк FX | `cbr-xml-daily.ru/daily_json.js` | REST при недоступности MOEX |
> | Свечи (спарклайн/бэкфилл) | MOEX `.../candles.json`, Binance `/api/v3/klines` | REST по требованию |
>
> «Торги закрыты» детектится по свежести `SYSTIME` (проверено ночью 2026-07-28).

---

## Фронтир сейчас: T09, T12 ✅ CODE-DONE; нужны browser/API smoke и production backfill

> Техдолг после ревью фронтира 2026-07-29 (не блокеры, вынести при случае):
> - **Дубли логики FORTS-контракта** — nearest-contract в 3 местах (front `moex-iss.parser.ts`, front `candles.service.ts`, server `parsers.ts`). Вынести общий helper; реестр инструментов фронт/сервер — сейчас ручное зеркало, риск рассинхрона (общий `packages/` модуль, прецедент есть — `packages/algorithms`).
> - **`derived` QuoteSource** — производные штампуются `source:'moex'`; добавить `'derived'` в union, если UI будет ветвиться по источнику.
> - **tonem-server**: N+1 в `latest()` и sequential upserts (→ `$transaction`/`createMany`); dead `selectNearestAtOrBefore`; unused `private logger`; unsafe `as`-касты вместо narrow-геттеров; runtime-стейдж Dockerfile тащит devDeps (`npm prune --omit=dev`); плоская структура src → фичи-модули по мере роста (T09).
> - **T07 ввод владельца**: Metrika counter ID (сниппет пока закомментирован), donate-URL (футер «кофе автору» — сниппет в `deployments/tonem/README.md`, не свёрстан), DNS для tonem.ru перед certbot.

---

# T01 — Скаффолд: Hello, tonem ✅ DONE (2026-07-28)

**What to build:** Angular 21 приложение `apps/tonem` (standalone, signals, zoneless, SCSS).
Один тёмный экран, по центру огромная захардкоженная цифра «78.58», внизу статичная
полоса-заглушка тикера. `ng serve` и `ng build` работают. Проверено, что Angular 21
не ломает Angular 18 в `apps/frontend` под npm workspaces (вложенные node_modules).
**Blocked by:** —
**Status:** done

- [x] `apps/tonem` собирается и отдаёт страницу с гигантской цифрой (бандл 31 kB transfer)
- [x] zoneless change detection включён (без zone.js)
- [x] Базовая типографика: цифра масштабируется под вьюпорт (clamp/vmin)
- [x] `npm run build:frontend` по-прежнему зелёный — потребовался фикс путей в `apps/frontend/angular.json`: primeflex/primeicons/quill поднялись в корневые node_modules при npm install (пути → `../../node_modules/...`)
- [~] eslint-конфиг по образцу основного фронта — отложено (у фронта legacy eslintrc на eslint 8, у нас eslint 9/flat; завести отдельным шагом)

Дополнительно сделано: 3 vitest-теста зелёные; root scripts `build:tonem`, `start:tonem`.

# T02 — Живые деньги: MOEX-коннектор + RatesStore ✅ DONE (2026-07-28)

**What to build:** `MoexIssService` (REST-поллинг 10 сек в торговые часы, 5 мин ночью),
сигнальный `RatesStore`. Герой показывает живой USD/RUB, лента — все 6 инструментов
первой очереди (USD/RUB, EUR/RUB, CNY/RUB, Brent, золото, IMOEX). Состояние
«торги закрыты, последняя цена в HH:MM» по свежести SYSTIME. ЦБ РФ как фолбэк
при недоступности MOEX. Реестр инструментов — единый конфиг (id, источник, пара,
формат, единицы), переиспользуемый позже бэкендом.
**Blocked by:** T01
**Status:** done

- [x] Цифры совпадают с moex.com (парсеры на живых фикстурах MOEX; LAST→MARKETPRICE для EUR)
- [x] Ночью/в выходные — «торги закрыты · последняя цена в HH:MM» (deriveStatus по торговому окну)
- [x] Поллинг замедляется вне торговых часов (pollDelayMs: 10с / 5мин)
- [x] При падении MOEX FX-пары переключаются на ЦБ (бейдж «ЦБ» / «курс ЦБ РФ»)
- [x] Реестр инструментов — `core/instruments/instrument.registry.ts`, типизирован, готов к переиспользованию бэкендом

Реализация: `core/moex/` (moex-time, market-hours, moex-iss.parser/service), `core/cbr/`, `core/rates/` (quote.model, value.format, rates.store, rates-poller). 48 vitest-тестов зелёные, бандл 44 kB transfer. Открытое: EUR_RUB__TOM имеет LAST=null вечером — берём MARKETPRICE (покрыто тестом).

# T03 — Крипта: Binance WebSocket + одометр ✅ DONE (2026-07-29)

**What to build:** `BinanceWsService` — combined stream BTC/ETH/TON, throttle до
~500мс, авто-реконнект с backoff. Анимация смены цены: цифры-одометр (прокрутка
по направлению движения) + тающая вспышка зелёный/красный за ~1с.
`prefers-reduced-motion` → мгновенный фейд без анимации.
**Blocked by:** T02
**Status:** done (2026-07-29)

- [x] Крипта обновляется в 3 часа ночи (MOEX спит — крипта дышит) — Binance miniTicker WS, 24/7
- [x] Одометр + вспышка работают на герое и в ленте — `shared/odometer`
- [x] Обрыв WS переподключается без перезагрузки страницы — backoff 1с→30с, fake-timer тесты
- [x] При reduced-motion никаких прокруток — статичный рендер, тихий фейд

# T04 — Сырьевая полка + производные ✅ DONE (2026-07-29)

**What to build:** FORTS-инструменты (пшеница, АИ-95, кофе, апельсиновый сок, сахар) —
выбор ближайшего ликвидного контракта по ASSETCODE через ISS. `DerivedEngine`:
EUR/USD, BTC/RUB, BTC-в-золоте, BTC-в-баррелях, «индекс завтрака»
(нормированный композит кофе+сок+пшеница+сахар), рубль-в-граммах-золота.
Все ~20 позиций в ленте.
**Blocked by:** T02
**Status:** done (2026-07-29)

- [x] 14 живых + 6 производных позиций отображаются в тикере — реестр расширен до 20
- [x] Производные пересчитываются при каждом обновлении сырья — `core/derived` computed-сигналы
- [x] Если сырьё для производной недоступно — позиция честно скрыта, а не «0»

# T05 — Генеративный фон + движок настроения ✅ DONE (2026-07-29)

**What to build:** canvas-фон «аврора» (медленные градиентные течения, зерно,
60fps, без внешних ассетов). `MoodEngine`: агрегированная дельта рынка за сессию →
CSS-переменные `--mood-hue`, `--mood-energy`, `--mood-turbulence`; фон, цифры и
лента перекрашиваются согласованно. Переходы настроения — плавные (десятки секунд).
**Blocked by:** T02
**Status:** done (2026-07-29)

- [x] Растущий рынок → тёплый спокойный фон, падающий → холодная буря — `shared/aurora` + `core/mood`
- [x] Нет резких скачков палитры (сглаживание) — EMA α=0.06, полураспад ~14с
- [x] FPS не проседает; при reduced-motion фон статичен — DPR≤2, разрешение ×0.5, пауза на скрытой вкладке
- [x] Фон не съедает читаемость цифры — CSS-виньетка под героем

# T06 — Настройки + шаринг вида через URL ✅ DONE (2026-07-29)

**What to build:** шторка настроек: приколоть героя / ротация избранного, скрыть и
переставить инструменты, дзен-тумблеры («убрать подписи», «убрать ленту», «убрать
мелкие циферки», «убрать часы», «убрать эти дурацкие цифры»), затемнение/блюр/
скорость фона, настроение вкл/выкл. Всё состояние сериализуется в URL-хэш;
кнопка «поделиться видом» копирует ссылку. localStorage — дефолт, URL перекрывает.
**Blocked by:** T04, T05
**Status:** done (2026-07-29)

- [x] Открытие чужой ссылки воспроизводит конфигурацию точь-в-точь
- [x] Возврат на сайт восстанавливает мои настройки из localStorage
- [x] Дзен-тумблеры стилизованы в тон zenrus (ироничные подписи)

Сделано: versioned `ViewSettingsStore` (localStorage + URL `#view`, чужой URL не затирает личный дефолт),
настраиваемый/ротируемый герой, избранное, порядок и видимость инструментов, дзен-переключатели,
настройки авроры и настроения, адаптивная шторка и копирование канонической ссылки.

# T07 — Деплой MVP: tonem.ru в проде ✅ CODE-DONE (2026-07-29)

**What to build:** `deployments/tonem/docker-compose.yml` + мультистейдж Dockerfile
(node build → nginx serve статики). Server-блок `tonem.ru` в существующем nginx,
`certbot --nginx -d tonem.ru -d www.tonem.ru`. Статичная OG-карточка + meta,
favicon, Яндекс.Метрика, донат-футер («кофе автору»).
**Blocked by:** T02
**Status:** code-done (2026-07-29); прод-вкат — после ввода владельца

- [ ] https://tonem.ru открывается с валидным TLS и живыми курсами — нужен DNS + certbot на хосте
- [ ] Превью ссылки в телеграме — брендовая карточка — `public/og-card.png` 1200×630 + OG/Twitter meta ✅
- [x] Кэш-заголовки: index.html no-cache, ассеты immutable — `deployments/tonem/nginx/tonem.conf`
- [ ] Метрика считает визиты — сниппет добавлен, нужен реальный counter ID (плейсхолдер XXXXXXXX)

Сделано: `deployments/tonem/` (Dockerfile.frontend мультистейдж → nginx, tonem-web в compose),
OG-карточка + favicon.svg/.ico + apple-touch-icon, Метрика (body, async), README с nginx-блоком
и certbot. Ждёт владельца: Metrika ID, donate-URL, DNS. Донат-футер — сниппет в README (не свёрстан в app).

# T08 — tonem-server: коллектор + БД + read API ✅ CODE-DONE (2026-07-29)

**What to build:** NestJS-приложение `apps/tonem-server` (@nestjs/schedule,
@nestjs/axios, Prisma). Миграция: таблица `ticks (instrument, ts, value, meta)`,
индекс `(instrument, ts)`. Коллектор пишет тик в минуту по всем живым инструментам
(тот же реестр, что на фронте). Read API: `GET /latest`, `GET /at?ts=`,
`GET /range?from=&to=&instrument=`. База `tonem` на существующем postgres:17.
Server-блок `api.tonem.ru` + certbot. Контейнер в `deployments/tonem/`.
**Blocked by:** T02
**Status:** code-done (2026-07-29); миграция и прод — с живым postgres

- [x] Тики копятся в БД 24/7 — @Cron каждую минуту, MOEX в торговые окна, крипта круглосуточно
- [ ] curl https://api.tonem.ru/latest — нужен деплой + DNS + certbot
- [x] /at?ts= возвращает ближайший тик ≤ ts по каждому инструменту — selectNearestAtOrBefore
- [x] Коллектор переживает рестарт (идемпотентные вставки, unique instrument+ts) — upsert, ts к началу минуты
- [x] CORS открыт только для tonem.ru

Сделано: `apps/tonem-server` (NestJS+Prisma, реестр переиспользован, 25 тестов, Dockerfile),
миграция 0001_init, compose-сервис, README с nginx api-блоком. Не запускалось против живой БД
(нет локального postgres); prisma migrate deploy — на хосте.

# T09 — Машина времени ✅ CODE-DONE (2026-07-30)

**What to build:** ползунок перемотки (появляется по свайпу/жесту/кнопке «назад во
времени»). При перемотке фронт идёт на `api.tonem.ru/at?ts=`, герой, лента и
движок настроения пересчитываются на тот момент. Заметный бейдж «прошлое: <дата
время>», кнопка «вернуться к настоящему». Live-потоки на паузе в режиме прошлого.
**Blocked by:** T08, T06
**Status:** code-done (2026-07-30); нужен browser smoke против deployed `api.tonem.ru`

- [x] Перемотка на вчера/неделю назад показывает цифры и настроение того момента
- [x] Падение api.tonem.ru не ломает live-режим (машина времени просто недоступна)
- [x] Состояние перемотки тоже сериализуется в URL (можно переслать «момент»)

Сделано: доступный range-scrubber, пресеты, точный datetime и свайп; два снимка `/at`
для historical mood; атомарная пауза/возврат live-потоков; fail-open с немедленным
восстановлением live snapshot; отмена устаревших запросов; `ts` сосуществует с `view` в hash.

# T10 — Спарклайн по тапу ✅ DONE (2026-07-29)

**What to build:** тап/клик на героя → оверлей с внутридневным графиком инструмента
(MOEX candles / Binance klines, browser-direct). Ручной SVG-полилайн, без чарт-либ.
Подписи min/max за день. Свайп вниз/крестик — закрыть.
**Blocked by:** T02
**Status:** done (2026-07-29)

- [x] У каждого инструмента есть рабочий спарклайн за сегодня — `core/candles` (MOEX candles / Binance klines)
- [x] График строится <300мс после тапа — ручной SVG-полилайн, `shared/sparkline`
- [x] Ночью для MOEX — кривая вчерашней сессии с пометкой — decideSession + бейдж «вчерашняя сессия»

Сделано: тап на герое открывает оверлей; закрытие — ×/бэкдроп/свайп вниз; min/max подписи.

# T11 — Генеративный звук ⚠️ DEPRECATED (2026-07-30) → заменено на T14

**What to build:** WebAudio/Tone.js эмбиент-движок: дроны/пэды/редкие ноты, лад и
плотность следуют за `MoodEngine` (рост — светлее, падение — темнее и медленнее).
По умолчанию выкл; кнопка «включить звук» (первый жест = разрешение автоплея).
Громкость и вкл/выкл — в настройках и URL.
**Blocked by:** T05
**Status:** ~~code-done (2026-07-29)~~ → **deprecated (2026-07-30)**: полностью заменён на T14 (локальные CC0-записи). Код удалён из runtime и тестов.

- [x] Звук непрерывен и неповторим (генератив, не луп)
- [x] Смена настроения рынка слышна в течение ~10 секунд
- [x] Нет щелчков/артефактов при переходах; вкладка в фоне — звук мьютится

Сделано: нативный WebAudio-граф без тяжёлой зависимости Tone.js, непрерывные дроны и случайные
ноты из mood-зависимого лада, плавная автоматизация gain/filter/frequency, autoplay-safe `armed` режим,
пауза/мьют скрытой вкладки, громкость и intent в настройках/localStorage/URL.

Удалённые файлы: `core/audio/ambient.model.ts`, `core/audio/ambient-audio.engine.ts`,
`core/audio/ambient-audio.port.ts`, их spec-файлы. Компонент `SoundControlComponent`
переписан на `RecordedMusicPlayer`. См. T14.<!-- T11 deprecated: replaced by T14 -->

# T12 — Бэкфилл истории ✅ CODE-DONE (2026-07-30)

**What to build:** скрипт в `tonem-server`: догружает историю из свечей MOEX и
Binance — часовое разрешение для глубокого прошлого (год+), минутное для последних
недель. Идемпотентен (skip существующих). Прогресс-лог.
**Blocked by:** T08
**Status:** code-done (2026-07-30); нужен production run с `DATABASE_URL`

- [~] Годовая история загружается для всех существовавших инструментов; AI95 до листинга MOEX честно `unavailable`
- [x] Повторный запуск не дублирует и не перезаписывает строки

Сделано: полная ISS/Binance pagination, непересекающиеся hourly/1m диапазоны,
Binance close-time без look-ahead, архивное discovery и nearest-expiry roll для FORTS,
`createMany(skipDuplicates)` чанками, проверки начала/конца/внутренних дыр, progress-log
и ненулевой exit при частичном покрытии или ошибке источника.

# T13 — PWA ✅ CODE-DONE (2026-07-29)

**What to build:** `ng add @angular/pwa`: манифест, иконки, офлайн-оболочка
(последние курсы + пометка «офлайн»). Установка на экран «Домой».
**Blocked by:** T07
**Status:** code-done (2026-07-29); установка на реальных iOS/Android ждёт smoke-test после TLS-деплоя

- [~] Сайт устанавливается как приложение на iOS/Android — manifest, service worker и иконки готовы; нужен device smoke-test
- [x] Без сети открывается оболочка с последними данными

Сделано: Angular service worker, branded webmanifest и 8 размеров иконок, install metadata для iOS,
офлайн-кэш нормализованных последних котировок в `RatesStore`, connectivity badge/статус и корректные
no-cache nginx-заголовки для control-файлов service worker.

# T14 — Локальная библиотека CC0-записей ✅ CODE-DONE (2026-07-30)

**What to build:** Заменить генеративный WebAudio (T11, deprecated) на локальную
библиотеку из 10 спокойных записей с проверяемым статусом CC0/Public Domain.
Проигрыватель (`RecordedMusicPlayer`) на HTMLAudioElement, плейлист с автопереходом,
кнопки next и info, попап с метаданными и лицензионным реестром.
**Blocked by:** T06 (settings store)
**Replaces:** T11

- [x] 10 CC0-записей скачаны в `public/audio/tracks/` (OpenGameArt, verified CC0 1.0)
- [x] `public/audio/LICENSES.md` — человекочитаемый реестр с композитором, исполнителем, источником, SHA-256
- [x] `core/music/music-library.ts` — машинно-читаемый каталог (id, assetUrl, title, composer, performer, sourceUrl, license)
- [x] `core/music/recorded-music-player.ts` — плеер: HTMLAudioElement, gesture-unlock, автопереход по ended, sequential playlist, visibility/pagehide lifecycle, тестируемая factory через InjectionToken
- [x] `shared/sound-control/` — переписан: кнопка toggle, next, info. Статусные метки обновлены
- [x] `shared/music-info/` — диалог (`role=dialog`): текущий трек, полный каталог, ссылки на источник и LICENSES.md
- [x] settings drawer — обновлён: «включить спокойную музыку», новые статусные тексты
- [x] `ngsw-config.json` — добавлены форматы mp3, ogg (lazy, не prefetch)
- [x] `ViewSettings.sound.enabled` и `.sound.volume` — обратная совместимость сохранена
- [x] ambient-audio код помечен deprecated в тикете; файлы удалены из runtime (core/audio/ambient*)
- [x] 309/309 тестов проходят, build:tonem зелёный

**Состав библиотеки:** 10 треков от Yoiyami, Kistol, cynicmusic (все CC0 1.0 Universal).
Неоклассическое фортепиано и эмбиент — подходит для yoga/relax сопровождения.
Треки: First Light Particles, Yoiyami Core Theme, The Budding of Consciousness,
Bluebonnet, Daisy, Catmint, Forget Me Not, Bedazzled, Waiting II, November Snow.

**Примечание:** Изначально планировались строго классические записи (Satie, Debussy, Chopin),
но CC0-записи их исполнений практически отсутствуют — все найденные перформансы требуют
CC-BY/CC-BY-SA атрибуции. Вместо этого выбраны оригинальные неоклассические композиции
с явной проверяемой CC0-дедикацией.

---

# OPS-01 — 🔐 Ротация Cloudflare API-токена

**What to build:** в `deployments/prod/certbot.md` лежит живой Cloudflare API-токен
открытым текстом (закоммичен в репо). Отозвать токен в Cloudflare, выпустить новый,
перенести в ansible private vars (существующий механизм `.private`), вычистить из
`certbot.md`, оставить заметку о ротации. Опционально: `git filter-repo` для истории.
**Blocked by:** —
**Status:** ready-for-agent

- [ ] Старый токен отозван (проверено 401 от CF API)
- [ ] Новый токен — только в `.private`/ansible vars
- [ ] В репо токена нет (grep по истории — по желанию)

# OPS-02 — Миграция apps/frontend на Angular 21 (когда-нибудь)

**What to build:** последовательная миграция основного фронта 18→19→20→21 по
официальному update guide. Отдельный проект, не блокирует tonem.
**Blocked by:** —
**Status:** parked

- [ ] Каждый шаг миграции — отдельный зелёный билд + прогон основных сценариев

---

## Парковка (этап 3, без тикетов пока)

- Телеграм-бот «тонем?» — утренний дайджест
- Embed-виджет для чужих сайтов
- Медиа-паки фонов (видео/фото пресеты)
- Нейро-лупы как переключаемые «станции» звука
