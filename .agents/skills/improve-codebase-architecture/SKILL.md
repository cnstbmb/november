---
name: improve-codebase-architecture
description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick. Use when user wants to improve codebase structure or fix a ball of mud.
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones.

## Process

### 1. Explore

Walk the codebase and note where you experience friction:
- Where understanding one concept requires bouncing between many small modules?
- Where are modules shallow?
- Where have pure functions been extracted just for testability, but bugs hide in how they're called?
- Apply the **deletion test** to suspicious modules.

### 2. Present candidates as an HTML report

Write a self-contained HTML file (Tailwind + Mermaid via CDN) to the OS temp directory. Each candidate gets a card with: files, problem, solution, benefits, before/after diagram, recommendation strength badge.

### 3. Grilling loop

Once user picks a candidate, run the `grilling` skill to walk the decision tree. Use `domain-modeling` inline as decisions crystallize.
