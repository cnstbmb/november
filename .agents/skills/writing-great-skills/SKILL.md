---
name: writing-great-skills
description: Reference for writing and editing skills well — the vocabulary and principles that make a skill predictable. Use when user wants to create, edit, or improve agent skills.
---

A skill exists to wrangle determinism out of a stochastic system. **Predictability** — the agent taking the same _process_ every run, not producing the same output — is the root virtue.

## Invocation

Two choices:
- **Model-invoked**: agent can fire it autonomously. Costs **context load**.
- **User-invoked**: only you can invoke it. Zero context load, but costs **cognitive load**.

## Writing the description

Front-load the skill's leading word. One trigger per branch. Cut identity already in the body.

## Information hierarchy

1. **In-skill step** — an ordered action in SKILL.md. Each step ends on a completion criterion.
2. **In-skill reference** — a definition, rule, or fact in SKILL.md, consulted on demand.
3. **External reference** — reference pushed to a separate file, reached by a context pointer.

## When to split

- **By invocation** — split off a model-invoked skill when it needs independent reach.
- **By sequence** — split when post-completion steps tempt the agent to rush.

## Pruning

Keep each meaning in a single source of truth. Hunt no-ops sentence by sentence — delete, don't rewrite.

## Leading words

A compact concept already in the model's pretraining that anchors behaviour in fewest tokens.

## Failure modes

- **Premature completion** — ending before genuinely done. Sharpen completion criterion.
- **Duplication** — same meaning in more than one place.
- **Sediment** — stale layers from adding without removing.
- **Sprawl** — skill too long. Disclose reference behind pointers.
- **No-op** — a line the model already obeys by default.
- **Negation** — prohibition backfires. Prompt the positive instead.
