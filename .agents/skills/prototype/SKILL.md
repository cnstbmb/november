---
name: prototype
description: Build a throwaway prototype to answer a design question — a runnable terminal app for state/logic questions, or several radically different UI variations toggleable from one route.
---

# Prototype

**Throwaway code that answers a question.**

## Pick a branch

- **"Does this logic / state model feel right?"** → Build a tiny interactive terminal app.
- **"What should this look like?"** → Generate several radically different UI variations on a single route, switchable via URL param + floating bottom bar.

## Rules

1. **Throwaway from day one**, clearly marked as such.
2. **One command to run.**
3. **No persistence by default.** State lives in memory.
4. **Skip the polish.** No tests, no error handling beyond runnability.
5. **Surface the state** after every action.
6. **Capture it when done.** Fold validated decisions into real code, capture prototype on a throwaway branch.
