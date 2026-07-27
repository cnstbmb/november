---
name: to-tickets
description: Break any plan, spec, or conversation into a set of tracer-bullet tickets, each declaring its blocking edges — written as text in a local file, or as native blocking links on a real tracker.
---

# To Tickets

Break a plan, spec, or conversation into **tracer bullet** tickets — vertical slices each declaring blocking edges.

## Process

### 1. Gather context

Work from conversation context. Fetch any referenced spec path, issue number, or URL.

### 2. Explore the codebase (optional)

Understand current state. Look for prefactoring opportunities.

### 3. Draft vertical slices

Each slice:
- Cuts a narrow but COMPLETE path through every layer
- Is demoable on its own
- Fits in a single context window
- Has its **blocking edges** declared

**Wide refactors** are the exception — use expand–contract pattern.

### 4. Quiz the user

Present breakdown with: title, blocked by, what it delivers.

### 5. Publish to tracker

Work the frontier — any ticket whose blockers are all done. Apply `ready-for-agent` label.

## Ticket template

```markdown
# <NN> — <Ticket title>

**What to build:** end-to-end behaviour from user's perspective.
**Blocked by:** which tickets gate this one.
**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2
```
