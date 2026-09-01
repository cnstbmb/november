# China Career Radar Constitution

## Core Principles

### I. Governed Sources Only

Every source MUST have a dated, declarative policy before any retrieval occurs. An acquisition mode is denied unless explicitly allowed. robots.txt is technical evidence, not legal permission. The system MUST NOT implement CAPTCHA bypass, fingerprint spoofing, proxy rotation for evasion, private API reverse engineering, session theft, or collection prohibited by a source's rules.

### II. Evidence Before Inference

Raw source content and normalized facts MUST remain distinguishable from inferred analysis. Work Permit support is confirmed only by direct evidence in the vacancy. The system MUST never present a legal conclusion, invented sponsorship, or unvalidated model output to a user. Material conclusions MUST cite short source evidence.

### III. Idempotent, Versioned Workflows

Ingestion, analysis, notification, and feedback MUST be idempotent. Material job and candidate-profile changes create immutable versions; unchanged inputs MUST NOT create duplicate versions, analyses, deliveries, or feedback records. Analysis identity MUST include job version, profile version, prompt version, and model.

### IV. Private and Minimal by Default

Administrative controls MUST remain private until explicit authentication is designed. Telegram access MUST use both user and chat allowlists. External analyzers receive only pseudonymous, assessment-relevant profile data. Secrets, authorization headers, cookies, full model reasoning, and large raw payloads MUST NOT enter logs.

### V. Simple, Observable, and Testable

The MVP MUST remain a modular monolith with explicit adapter boundaries and one required operational datastore. Structured logs, correlation IDs, source-run statistics, health checks, deterministic validation, and offline tests are mandatory. New services, containers, browser automation, or infrastructure require demonstrated present need.

## Product and Safety Constraints

- The primary market is Mainland China; Hong Kong and Macau are watchlist regions.
- Candidate-specific professional fit is separate from Work Permit risk.
- Unknown sponsorship caps the effective verdict at `review`; explicit refusal of lawful employment support rejects the opportunity.
- The DC deployment MUST function without a home worker. Home egress remains optional future capability.
- External credentials MUST be optional for local development through mock analysis and console notification.
- URL retrieval MUST enforce scheme, DNS/IP, redirect, timeout, content-type, and response-size protections.
- Raw evidence is bounded and stored separately from normalized job data.

## Development Workflow and Quality Gates

- Start with the smallest end-to-end path: fixture/manual input through persistence and console notification.
- Add external adapters only behind the same tested contracts.
- Default tests MUST make no requests to live sources, model providers, or Telegram.
- Required gates are formatting, type checking, unit tests, integration tests for persistence/idempotency, and parser fixture tests.
- Infrastructure and deployment changes require targeted validation; production deployment is out of scope for this feature branch.
- ADRs are required for deviations from agreed defaults or new hard-to-reverse boundaries.

## Governance

This constitution supplements the repository `AGENTS.md` and cannot relax its operational or secret-handling rules. Amendments require an explicit rationale, updated version, and review of affected specifications and ADRs. Any conflict is resolved in favor of the stricter safety or privacy rule.

**Version**: 1.0.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-27
