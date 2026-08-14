# Tonem analytics

Separate self-hosted Umami 3.2.0 and PostgreSQL stack for privacy-safe Tonem product
analytics. It shares only `remnawave-network` with the public proxy; its database and
volume are independent from Tonem quotes and history.

Production is provisioned by the `tonem_analytics` Ansible role. Do not create a
committed `.env`; put database credentials and `APP_SECRET` in Vault/private inventory.

The public proxy exposes only the tracker plus `/api/send` and `/api/batch` under
`https://tonem.ru/analytics/`. The dashboard/admin API binds to loopback port 3300
and is reached through the protected SSH entry.

Bootstrap is deliberately two-step:

1. Set the database/app secrets but leave `tonem_analytics_website_id: ""`, then
   run check-mode and the separately approved first apply. The role starts Umami
   while keeping the Tonem tracker disabled.
2. Change Umami's initial admin password, create the `tonem.ru` website manually,
   store its public UUID as `tonem_analytics_website_id`, run check-mode again,
   then request approval for the second apply. That apply enables the tracker.

```bash
npm run ansible:tonem-analytics:check
# each production apply only after reviewing dry-run and explicit approval:
npm run ansible:tonem-analytics
```

Daily jobs enforce 90-day raw retention and 12-month aggregate retention. Backup uses
a separate namespace with 7 daily, 4 weekly and 12 monthly copies; its failure is a
warning and never changes the Tonem SLO.
