---
name: migrate-to-shoehorn
description: Migrate test files from `as` type assertions to @total-typescript/shoehorn. Use when user mentions shoehorn, wants to replace `as` in tests, or needs partial test data.
---

# Migrate to Shoehorn

`shoehorn` lets you pass partial data in tests while keeping TypeScript happy.

## Install

```bash
npm i @total-typescript/shoehorn
```

## Migration patterns

### `as Type` → `fromPartial()`

```ts
import { fromPartial } from "@total-typescript/shoehorn";
getUser(fromPartial({ body: { id: "123" } }));
```

### `as unknown as Type` → `fromAny()`

```ts
import { fromAny } from "@total-typescript/shoehorn";
getUser(fromAny({ body: { id: 123 } }));
```

## When to use

| Function | Use case |
|---|---|
| `fromPartial()` | Pass partial data that still type-checks |
| `fromAny()` | Pass intentionally wrong data |
| `fromExact()` | Force full object |

## Workflow

1. Install: `npm i @total-typescript/shoehorn`
2. Find test files: `grep -r " as [A-Z]" --include="*.test.ts" --include="*.spec.ts"`
3. Replace `as Type` with `fromPartial()`, `as unknown as Type` with `fromAny()`
4. Add imports from `@total-typescript/shoehorn`
5. Run type check
