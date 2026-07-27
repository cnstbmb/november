---
name: tdd
description: Test-driven development with a red-green-refactor loop. Builds features or fixes bugs one vertical slice at a time. Use when user wants test-first development or mentions "red-green-refactor".
---

# Test-Driven Development

TDD is the red → green loop.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. A good test reads like a specification and survives refactors.

## Seams — where tests go

A **seam** is the public boundary you test at. **Test only at pre-agreed seams.** Confirm seams with the user before writing any test.

## Anti-patterns

- **Implementation-coupled** — mocks internal collaborators, tests private methods. Breaks on refactor.
- **Tautological** — assertion recomputes expected value the same way the code does.
- **Horizontal slicing** — writing all tests first, then all implementation. Work in **vertical slices** instead.

## Rules of the loop

- **Red before green.** Write the failing test first.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to code-review, not the implementation cycle.
