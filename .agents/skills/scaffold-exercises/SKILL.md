---
name: scaffold-exercises
description: Create exercise directory structures with sections, problems, solutions, and explainers. Use when user wants to scaffold exercises, create exercise stubs, or set up a new course section.
---

# Scaffold Exercises

Create exercise directory structures.

## Directory naming

- **Sections**: `XX-section-name/` inside `exercises/`
- **Exercises**: `XX.YY-exercise-name/` inside a section
- Names are dash-case

## Exercise variants

Each exercise needs at least one: `problem/`, `solution/`, `explainer/`.

## Required files

Each subfolder needs a `readme.md` that is not empty and has no broken links.

## Workflow

1. Parse the plan — extract section names, exercise names, variant types
2. Create directories — `mkdir -p`
3. Create stub readmes
4. Validate structure
5. Fix any errors
