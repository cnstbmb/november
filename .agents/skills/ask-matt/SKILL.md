---
name: ask-matt
description: Ask which skill or flow fits your situation. A router over the user-invoked skills in this repo.
---

# Ask Matt

A **flow** is a path through the skills.

## The main flow: idea → ship

1. **`grill-with-docs`** — sharpen the idea by interview (stateful, builds CONTEXT.md and ADRs). No codebase? Use `grill-me`.
2. **Branch — can you settle every question in conversation?** If a question needs a runnable answer, use `handoff` → `prototype` → `handoff` back.
3. **Branch — multi-session build?**
   - Yes → `to-spec` → `to-tickets` → `implement` per ticket
   - No → `implement` directly

## On-ramps

- **Bugs/requests piling up** → `triage`
- **Something's broken** → `diagnosing-bugs`
- **Huge foggy effort** → `wayfinder` → hands off to main flow

## Codebase health

- `improve-codebase-architecture` — surface deepening opportunities
- `codebase-design` — design deep modules

## Vocabulary underneath

- `domain-modeling` — sharpen domain language
- `codebase-design` — deep-module vocabulary

## Crossing sessions

- `handoff` — fork context to a new session
- `compact` — continue same session, summarized

## Standalone

- `grill-me` — stateless grilling (no codebase)
- `prototype` — throwaway code to answer a design question
- `research` — background agent investigating primary sources
- `teach` — learn over multiple sessions
- `writing-great-skills` — skill-writing reference

## Precondition

Run `setup-matt-pocock-skills` before your first engineering flow.
