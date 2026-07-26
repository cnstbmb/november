# Entry -> Master -> Exit Renderer

`render_entry_master_exit.py` — единственный source of truth для генерации
Remnawave Config Profiles. Статические JSON-шаблоны удалены: они не
использовались Ansible и сохраняли устаревшие сторонние camouflage targets.

## Production domains

- `moscow.himenkov.ru` — master, публичные MOSCOW XHTTP/Reality/Hysteria2.
- `himenkov.ru` — exit, публичный AMSTERDAM XHTTP и bridge inbound.
- `home.himenkov.ru` — скрытый домашний exit и bridge inbound.

Новые профили не должны использовать сторонние SNI/targets. Для Reality
используется self-steal target `127.0.0.1:443` и SNI домена соответствующего
узла.

## Generated profiles

Bootstrap вызывает renderer и пишет актуальные JSON в:

```text
.private/ansible/prod/remnawave-topology/profiles/
```

Renderer поддерживает:

- `ENTRY_NODE` — опциональный public entry и `XHTTP_TO_MASTER`;
- `MASTER_NODE` — `BRIDGE_MASTER_IN`, MOSCOW public inbounds, WireGuard,
  `GRPC_TO_EXIT` и optional `GRPC_TO_HOME_RU`;
- `EXIT_NODE` — AMSTERDAM public inbound и `BRIDGE_EXIT_IN`;
- `HOME_EXIT_NODE` — optional hidden home bridge;
- `DIRECT_EXIT` — optional dedicated direct-only node.

В текущем production inventory отдельные ENTRY и DIRECT_EXIT отсутствуют.

## Import order

1. Запустить `tools/ansible/bootstrap_remnawave_topology.sh`.
2. Проверить сгенерированные private JSON и summary.
3. Импортировать Config Profiles в Remnawave.
4. Привязать профили и active inbounds к нодам.
5. Обновить Internal Squads и system users.
6. Запустить `npm run remnawave:audit:self-steal`.

`WG_KEENETIC_IN` остается частью канонического `MASTER_NODE`; peers и
`secretKey` задаются только в private topology.
