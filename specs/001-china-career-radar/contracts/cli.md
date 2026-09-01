# CLI Contract

All commands exit non-zero on validation or operational failure and print one JSON result to stdout when `--json` is present. Secrets and raw snapshots never appear in output.

```text
npm run radar -- demo [--fixture chinajob-senior-frontend]
npm run radar -- add-text --file <path> [--title ...] [--company ...] [--city ...] [--url ...]
npm run radar -- add-url <https-url>
npm run radar -- latest [--candidate cnstbmb|lanok] [--limit 20]
npm run radar -- stats
npm run radar -- profile [cnstbmb|lanok]
npm run radar -- reanalyze --candidate <id> [--since 90d] --dry-run
npm run db:migrate
```

`demo` is the acceptance path: fixture -> raw job -> normalization -> deduplication -> hard filters -> mock analysis -> persistence -> console notification.
