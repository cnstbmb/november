---
name: diagnosing-bugs
description: "Disciplined diagnosis loop for hard bugs and performance regressions: reproduce → minimise → hypothesise → instrument → fix → regression-test. Use when user says \"diagnose\", \"debug this\", or reports something broken."
---

# Diagnosing Bugs

## Phase 1 — Build a feedback loop

**This is the skill.** Build a tight pass/fail signal for the bug.

Ways to construct one: failing test, curl/HTTP script, CLI invocation, headless browser script, replay captured trace, throwaway harness, property/fuzz loop, bisection harness, differential loop, HITL bash script.

Completion criterion: one command that is **red-capable**, deterministic, fast, and agent-runnable.

## Phase 2 — Reproduce + minimise

Run the loop. Watch it go red. Shrink to smallest scenario that still goes red.

## Phase 3 — Hypothesise

Generate 3–5 ranked, falsifiable hypotheses. Show to user before testing.

## Phase 4 — Instrument

Change one variable at a time. Prefer debugger/REPL over logs. Tag all debug logs with unique prefix.

## Phase 5 — Fix + regression test

Write regression test **before** the fix at a correct seam. If no correct seam exists, that's the finding — flag for architecture improvement.

## Phase 6 — Cleanup + post-mortem

Remove all instrumentation. Ask: what would have prevented this bug? Hand off to `improve-codebase-architecture` if needed.
