---
name: setup-pre-commit
description: Set up Husky pre-commit hooks with lint-staged (Prettier), type checking, and tests. Use when user wants pre-commit hooks, Husky, or lint-staged.
---

# Setup Pre-Commit Hooks

## What This Sets Up

- **Husky** pre-commit hook
- **lint-staged** running Prettier
- **Prettier** config (if missing)
- **typecheck** and **test** scripts in pre-commit

## Steps

1. Detect package manager (npm, pnpm, yarn, bun)
2. Install: `husky lint-staged prettier`
3. Initialize Husky: `npx husky init`
4. Create `.husky/pre-commit` with lint-staged, typecheck, test
5. Create `.lintstagedrc` with Prettier config
6. Create `.prettierrc` if missing
7. Verify and commit
