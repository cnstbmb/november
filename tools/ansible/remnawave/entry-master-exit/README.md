# Entry -> Master -> Exit Templates

Эта папка фиксирует рабочую схему Remnawave:

- `ENTRY_NODE` на `ya.himenkov.ru`
- `MASTER_NODE` на `moscow.himenkov.ru`
- `EXIT_NODE` на `serb.himenkov.ru`

Порты, transport и camouflage уже подогнаны под твою живую конфигурацию:

- `ENTRY_NODE`
  - public: `VLESS_TCP_REALITY` on `443`
  - bridge outbound: `XHTTP_TO_MASTER` -> `moscow:5335`
- `MASTER_NODE`
  - bridge inbound: `BRIDGE_MASTER_IN` on `5335`
  - public direct: `VLESS_REALITY_MOSCOW` on `10443`
  - public direct: `VLESS_REALITY_DIRECT_MSK` on `20443`
  - mandatory wireguard: `WG_KEENETIC_IN` on `51820`
  - bridge outbound: `GRPC_TO_EXIT` -> `serb:8443`
- `EXIT_NODE`
  - public direct: `VLESS_REALITY_DIRECT` on `443`
  - bridge inbound: `BRIDGE_EXIT_IN` on `8443`

## What Was Preserved

- ports
- `Reality target`
- `serverNames`
- `xhttp/grpc path/serviceName`
- routing logic
- public/bridge separation

## What Was Replaced With Placeholders

- reality private keys
- service-user UUIDs
- wireguard secret key and peer keys

Placeholders to replace:

- `REPLACE_ENTRY_REALITY_PRIVATE_KEY`
- `REPLACE_ENTRY_REALITY_SHORT_ID`
- `REPLACE_ENTRY_TO_MASTER_SERVICE_UUID`
- `REPLACE_MASTER_REALITY_PRIVATE_KEY`
- `REPLACE_MASTER_REALITY_SHORT_ID`
- `REPLACE_MASTER_DIRECT_MSK_REALITY_PRIVATE_KEY`
- `REPLACE_MASTER_DIRECT_MSK_REALITY_SHORT_ID`
- `REPLACE_MASTER_TO_EXIT_SERVICE_UUID`
- `REPLACE_WG_SECRET_KEY`
- `REPLACE_WG_PEER_PUBLIC_KEY`
- `REPLACE_EXIT_REALITY_PRIVATE_KEY`
- `REPLACE_EXIT_REALITY_SHORT_ID`

## Config Profiles

- [ENTRY_NODE.profile.template.json](/Users/konstantin/november/tools/ansible/remnawave/entry-master-exit/ENTRY_NODE.profile.template.json)
- [MASTER_NODE.profile.template.json](/Users/konstantin/november/tools/ansible/remnawave/entry-master-exit/MASTER_NODE.profile.template.json)
- [EXIT_NODE.profile.template.json](/Users/konstantin/november/tools/ansible/remnawave/entry-master-exit/EXIT_NODE.profile.template.json)

## Nodes

- `ya.himenkov.ru` -> `ENTRY_NODE`
- `moscow.himenkov.ru` -> `MASTER_NODE`
- `serb.himenkov.ru` -> `EXIT_NODE`

## Hosts

Advanced host overrides: empty/default.

- `WHITE LIST`
  - profile: `ENTRY_NODE`
  - inbound: `VLESS_TCP_REALITY`
  - address: `51.250.25.137`
  - port: `443`
  - node: `ya.himenkov.ru`
- `MOSCOW`
  - profile: `MASTER_NODE`
  - inbound: `VLESS_REALITY_MOSCOW`
  - address: `5.42.111.142`
  - port: `10443`
  - node: `moscow.himenkov.ru`
- `DIRECT MOSCOW`
  - profile: `MASTER_NODE`
  - inbound: `VLESS_REALITY_DIRECT_MSK`
  - address: `5.42.111.142`
  - port: `20443`
  - node: `moscow.himenkov.ru`
- `SERBIA`
  - profile: `EXIT_NODE`
  - inbound: `VLESS_REALITY_DIRECT`
  - address: `149.33.31.13`
  - port: `443`
  - node: `serb.himenkov.ru`

## Internal Squads

- `Public Squad`
  - `VLESS_TCP_REALITY`
  - `VLESS_REALITY_MOSCOW`
- `Direct Exit Squad`
  - `VLESS_REALITY_DIRECT_MSK`
  - `VLESS_REALITY_DIRECT`
- `Bridge Master Squad`
  - `BRIDGE_MASTER_IN`
- `Bridge Exit Squad`
  - `BRIDGE_EXIT_IN`

## Users

System users:

- `bridge_entry_to_master`
  - internal squads: `Bridge Master Squad`
  - used by `ENTRY_NODE -> XHTTP_TO_MASTER`
- `bridge_master_to_exit`
  - internal squads: `Bridge Exit Squad`
  - used by `MASTER_NODE -> GRPC_TO_EXIT`

Regular users:

- assign `Public Squad` for:
  - `WHITE LIST`
  - `MOSCOW`
- assign `Direct Exit Squad` for:
  - `DIRECT MOSCOW`
  - `SERBIA`

Current public pattern:

- ordinary users are in `Public Squad` + `Direct Exit Squad`
- no external squad
- no host-specific advanced overrides

## Import Order

1. Replace placeholders in the three profile templates.
2. Import `Config Profiles` into Remnawave.
3. Bind profiles to nodes.
4. Create/update `Internal Squads`.
5. Create/update the two system users.
6. Bind ordinary users to `Public Squad` and optionally `Direct Exit Squad`.
7. Create/update hosts `WHITE LIST`, `MOSCOW`, `DIRECT MOSCOW`, `SERBIA`.

## WireGuard

`WG_KEENETIC_IN` should be treated as mandatory.

Peers and `secretKey` remain deployment-specific, but сам inbound считается
частью канонического `MASTER_NODE` профиля и должен генерироваться всегда.
