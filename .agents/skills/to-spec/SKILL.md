---
name: to-spec
description: Turn the current conversation into a spec and publish it to the project issue tracker. No interview — just synthesizes what you've already discussed.
---

# To Spec

Turn the current conversation context and codebase understanding into a spec (PRD). Do NOT interview the user — just synthesize what you already know.

## Process

1. Explore the repo to understand the current state of the codebase.
2. Sketch out the **seams** at which to test the feature. Confirm with user.
3. Write the spec using the template below, publish to the issue tracker, apply `ready-for-agent` label.

## Spec Template

```markdown
## Problem Statement
The problem from the user's perspective.

## Solution
The solution from the user's perspective.

## User Stories
A LONG, numbered list of user stories. Format: "As an <actor>, I want <feature>, so that <benefit>"

## Implementation Decisions
A list of implementation decisions: modules, interfaces, technical clarifications, architectural decisions, schema changes, API contracts. No specific file paths or code snippets.

## Testing Decisions
What makes a good test, which modules tested, prior art.

## Out of Scope
What's out of scope for this spec.

## Further Notes
Any further notes about the feature.
```
