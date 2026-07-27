---
name: wayfinder
description: Plan a huge chunk of work, more than one agent session can hold, as a shared map of investigation tickets on the issue tracker — resolve them one at a time until the way to the destination is clear.
---

# Wayfinder

Chart a **shared map** on the issue tracker for work too big for one session.

## Plan, don't do

Each ticket resolves a **decision**, not delivers a feature. The map is done when the way is clear.

## The Map

A single issue labelled `wayfinder:map` containing:
- **Destination** — what reaching the end looks like
- **Notes** — domain, skills, preferences
- **Decisions so far** — one line per closed ticket with gist
- **Not yet specified** — in-scope fog you can't ticket yet
- **Out of scope** — work beyond the destination

## Tickets

Each ticket is a child issue of the map with a `wayfinder:<type>` label:

- **Research** (AFK) — reading docs, APIs, resources
- **Prototype** (HITL) — cheap concrete artifact to react to
- **Grilling** (HITL) — conversation via `grilling` + `domain-modeling`
- **Task** (HITL/AFK) — manual work blocking a decision

**Claim** a ticket by assigning it to yourself before any work.

## Invocation

Two modes:
- **Chart the map** — name destination → map frontier → create map + tickets + fire research subagents
- **Work through the map** — load map → choose frontier ticket → resolve → record → add new tickets

Never resolve more than one ticket per session (except research tickets).
