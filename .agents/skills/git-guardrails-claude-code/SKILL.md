---
name: git-guardrails-claude-code
description: Set up git hooks to block dangerous commands (push, reset --hard, clean, branch -D, etc.). Use when user wants to prevent destructive git operations or add git safety hooks.
---

# Git Guardrails

Sets up hooks that intercept and block dangerous git commands.

## What Gets Blocked

- `git push` (all variants including `--force`)
- `git reset --hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout .` / `git restore .`

## Steps

1. Ask the user: project-level or global setup?
2. Identify the hook mechanism available in the current environment.
3. For git hooks: create a `.git/hooks/pre-push` or suggest `core.hooksPath`.
4. Customize the blocked patterns with the user.
