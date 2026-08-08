# Domain Docs

How engineering skills should consume this repository's domain documentation.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repository root. It points to the `CONTEXT.md` files relevant to each application or package.
- **`docs/adr/`** for system-wide architectural decisions.
- The relevant context-level `CONTEXT.md` and `docs/adr/` under `apps/<context>/` or `packages/<context>/`.

If these files do not exist, proceed silently. Do not suggest creating them upfront. The `/domain-modeling` workflow creates them lazily when terminology or decisions are resolved.

## File structure

This repository uses a multi-context layout:

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                         ← system-wide decisions
├── apps/
│   └── <context>/
│       ├── CONTEXT.md
│       └── docs/adr/                 ← application-specific decisions
└── packages/
    └── <context>/
        ├── CONTEXT.md
        └── docs/adr/                 ← package-specific decisions
```

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in the relevant `CONTEXT.md`.

If a needed concept is absent, either reconsider whether the repository uses that language or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly rather than silently overriding the decision.
