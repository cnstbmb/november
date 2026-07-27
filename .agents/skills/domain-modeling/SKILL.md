---
name: domain-modeling
description: Actively build and sharpen a project's domain model — challenge terms against the glossary, stress-test with edge-case scenarios, and update CONTEXT.md and ADRs inline. Use when the user wants to pin down domain terminology, record an architectural decision, or another skill needs to maintain the domain model.
---

# Domain Modeling

Actively build and sharpen the project's domain model.

## File structure

```
/
├── CONTEXT.md          ← glossary
├── docs/
│   └── adr/
│       ├── 0001-<name>.md
│       └── 0002-<name>.md
└── src/
```

## During the session

- **Challenge against the glossary** — when a term conflicts, call it out
- **Sharpen fuzzy language** — propose precise canonical terms
- **Discuss concrete scenarios** — stress-test with edge cases
- **Cross-reference with code** — check whether code agrees with stated understanding
- **Update CONTEXT.md inline** — capture resolved terms immediately
- **Offer ADRs sparingly** — only when hard to reverse, surprising without context, and the result of a real trade-off
