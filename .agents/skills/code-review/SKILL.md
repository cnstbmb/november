---
name: code-review
description: "Two-axis review of the diff since a fixed point: Standards (coding standards + Fowler smells) and Spec (matches issue/PRD). Runs both as parallel sub-agents. Use when user wants to review a branch, PR, or changes."
---

# Code Review

Two-axis review of the diff between `HEAD` and a fixed point:

- **Standards** — does the code follow this repo's coding standards?
- **Spec** — does the code faithfully implement the originating issue/PRD/spec?

Both axes run as **parallel sub-agents**, then this skill aggregates.

## Process

### 1. Pin the fixed point

Capture the diff: `git diff <fixed-point>...HEAD`. Confirm the ref resolves and diff is non-empty.

### 2. Identify the spec source

Look for: issue references in commits, user-passed path, PRD/spec files matching branch name, or ask user.

### 3. Identify standards sources

Read `CODING_STANDARDS.md`, `CONTRIBUTING.md`, or similar. Always carry the **Fowler smell baseline**:
Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains, Middle Man, Refused Bequest.

### 4. Spawn both sub-agents in parallel

**Standards**: report every standards violation and baseline smell per file/hunk.
**Spec**: report missing/partial requirements, scope creep, and implementations that look wrong.

### 5. Aggregate

Present under `## Standards` and `## Spec` headings. End with one-line summary per axis.

## Why two axes

Code can pass one and fail the other — reporting separately stops one from masking the other.
