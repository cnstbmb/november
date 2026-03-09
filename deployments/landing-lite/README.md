# Landing Lite (for weak nodes)

Этот каталог для отдельной слабой машины с публичным лендингом.
Он не связан с `deployments/prod` и не должен запускаться на master.

## Запуск

```bash
cd deployments/landing-lite
docker compose up -d
```

## Обновление контента

Редактируй файлы в `deployments/landing-lite/site/` и перезапускай контейнер:

```bash
cd deployments/landing-lite
docker compose up -d
```
