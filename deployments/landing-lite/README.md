# Landing Lite (for weak nodes)

Этот каталог для отдельной слабой машины с публичным лендингом.
Он не связан с `deployments/prod` и не должен запускаться на master.
Финальный макет: `site/index.html`.
В каталоге `site/` также лежат `favicon.svg` и `og-image.svg`.

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
