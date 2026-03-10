# November Monorepo

Монорепозиторий с backend, frontend, инфраструктурой Ansible и отдельным легковесным лендингом для слабых машин.

## Что есть в проекте

- `backend/` — Node.js/TypeScript API (Express + PostgreSQL, миграции, утилиты).
- `frontend/` — Angular приложение.
- `deployments/prod/` — основной production docker-compose стек (master-нода).
- `deployments/landing-lite/` — отдельный легковесный лендинг (не для master).
- `ansible/` — плейбуки и роли для настройки master/workers.
- `tools/ansible/` — интерактивная генерация private inventory/vars и запуск playbooks.
- `algorithms/` — отдельные алгоритмические задачи/эксперименты.

## Ключевые возможности

- Единый набор npm-команд из корня для backend/frontend/build/deploy.
- Интерактивный bootstrap Ansible-конфигов в `.private/ansible/prod`.
- Запуск Ansible через `npm run ansible:*` с `--check` и выбором playbook.
- Отдельный боевой `landing-lite` стек с финальной страницей `deployments/landing-lite/site/index.html`.
- Разделение ролей машин: `master` для основного стека из `deployments/prod`, `landing-lite` для слабых/публичных хостов отдельно.

## Требования

- `Node.js` и `npm`
- `Docker` и `docker compose`
- `Ansible` (если запускаете инфраструктуру через playbooks)

## Быстрый старт

1. Установка зависимостей:

```bash
npm install
npm run prepare
```

2. Запуск backend/frontend локально:

```bash
npm run start:backend
npm run start:frontend
```

3. Линтеры и тесты:

```bash
npm run lint:fix:backend
npm run lint:fix:frontend
npm run test:algorithms
```

## Команды из корня

### Backend / Frontend

- `npm run start:backend` — старт backend в dev-режиме.
- `npm run build:backend` — сборка backend.
- `npm run build:backend:docker` — docker build backend (prod).
- `npm run start:frontend` — старт Angular dev server.
- `npm run build:frontend` — сборка frontend.
- `npm run build:frontend:docker` — docker build frontend (prod).
- `npm run watch:frontend` — watch build frontend.

### Production build scripts

- `npm run build:prod`
- `npm run build:prod:yc`

### Ansible (private bootstrap + run)

- `npm run ansible:bootstrap` — интерактивно создаёт private inventory и vars в `.private/ansible/prod/` (`hosts.yml`, `group_vars/all.yml`, `group_vars/master.yml`, `group_vars/workers.yml`).
- `npm run ansible:warmup` — последовательный SSH-прогрев хостов (`ssh ... exit` по каждому).
- `npm run ansible:run` — запуск `site.yml`.
- `npm run ansible:run:check` — dry-run `site.yml`.
- `npm run ansible:run:menu` — интерактивный выбор playbook.
- `npm run ansible:master` / `npm run ansible:master:check`
- `npm run ansible:workers` / `npm run ansible:workers:check`
- `npm run ansible:site` / `npm run ansible:site:check`

Поддержка хостов в bootstrap:

- `name` (например `test.beer.ru`)
- `name=ip` (например `test.beer.ru=8.80.55.35`)

Во втором случае в inventory автоматически добавляется `ansible_host`, что удобно до настройки DNS.

### Landing Lite

- `npm run landing:up` — поднять лендинг локально.
- `npm run landing:open` — открыть в браузере (`open http://localhost`, macOS).
- `npm run landing:logs` — смотреть логи.
- `npm run landing:down` — остановить.

## Инфраструктурные заметки

- Подробности по Ansible: `ansible/README.md`.
- Подробности по `landing-lite`: `deployments/landing-lite/README.md`.
- Для SSH через Cloudflare используйте `DNS only` запись (без проксирования), если нужен прямой SSH.
- Боевые переменные и inventory держите в `.private/` (папка в `.gitignore`).

## PostgreSQL локально (утилиты)

- Linux:

```bash
npm run pg:docker:linux
```

- Windows:

```bash
npm run pg:docker:win
```

## Статус текущего лендинга

- Финальная публичная страница: `deployments/landing-lite/site/index.html`
- Favicon: `deployments/landing-lite/site/favicon.svg`
- Open Graph image: `deployments/landing-lite/site/og-image.svg`
