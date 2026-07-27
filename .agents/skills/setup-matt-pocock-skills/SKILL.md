---
name: setup-matt-pocock-skills
description: Configure this repo for the engineering skills — issue tracker, triage labels, domain doc layout. Run once per repo before using the other engineering skills.
---

# Setup Matt Pocock's Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker** — where issues live (GitHub, GitLab, local markdown, or custom)
- **Triage labels** — the strings used for triage roles
- **Domain docs** — where CONTEXT.md and ADRs live

## Process

### 1. Explore

Check: `git remote -v`, `.git/config`, `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `docs/adr/`, `docs/agents/`, `.scratch/`, monorepo signals.

### 2. Present findings and ask

**Section A — Issue tracker.** Default: GitHub. Alternatives: GitLab, local markdown, or custom.

**Section B — Triage label vocabulary.** Default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.

**Section C — Domain docs.** Default: single-context (one `CONTEXT.md` + `docs/adr/`). Multi-context only for monorepos.

### 3. Confirm and edit

Show draft of `## Agent skills` block and config file contents.

### 4. Write

Edit `CLAUDE.md` or `AGENTS.md`. Write `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, `docs/agents/triage-labels.md`.

### 5. Done

Tell user which engineering skills will read from these files.
