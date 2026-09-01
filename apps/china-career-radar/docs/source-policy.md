# Политика источников

Любой acquisition mode запрещён по умолчанию и включается только строгим YAML policy. `robots.txt` фиксируется как технический сигнал, но не считается разрешением на агрегацию. Неизвестные и discovery-only URL сохраняются как `pending_manual` без DNS/HTTP запроса.

ChinaJob в MVP работает только на синтетических минимизированных fixtures. На 2026-08-27 `/job/` разрешён robots.txt, но явная лицензия/API/Terms для повторного использования данных не найдены. Для live-режима требуется письменное согласование через официальный контакт и обновление `policyStatus`, `allowedModes`, approval evidence и даты проверки.

Запрещены CAPTCHA bypass, fingerprint spoofing, evasive proxy rotation, private API reverse engineering, чужие сессии и маскировка частоты запросов.

Разрешённый `manual_url` проходит централизованный SSRF guard: exact host policy, безопасная схема/порт, проверка всех DNS-адресов, pinned connection, ручная проверка каждого redirect, TLS, timeout, MIME и лимит 1 MiB.
