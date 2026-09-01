# Feature Specification: China Career Radar MVP

**Feature Branch**: `codex/001-china-career-radar`

**Created**: 2026-08-27

**Status**: Ready for planning

**Input**: A private family service that collects permitted job opportunities in Mainland China, normalizes and deduplicates them, evaluates them independently for `cnstbmb` and `lanok`, and delivers suitable opportunities with evidence and risk flags.

## User Scenarios & Testing

### User Story 1 - Process a vacancy end to end (Priority: P1)

As a family member, I can submit vacancy text or run a bundled fixture and receive a validated candidate-specific assessment while the original content, normalized vacancy, version, filter outcome, and analysis remain available for later inspection.

**Why this priority**: This is the smallest useful vertical slice and proves that the radar can turn unstructured vacancy content into a durable, actionable result without external credentials.

**Independent Test**: Run the documented demonstration command with no model or Telegram credentials and verify that one vacancy, one version, applicable profile analyses, and console notifications are produced.

**Acceptance Scenarios**:

1. **Given** valid manual vacancy text, **When** it is submitted, **Then** the original content is retained separately, normalized, deduplicated, filtered per candidate, analyzed, persisted, and notified through the available notifier.
2. **Given** the identical vacancy is submitted again, **When** processing completes, **Then** no additional version, analysis, or notification is created.
3. **Given** a material field or description changes, **When** the vacancy is submitted again, **Then** a new immutable version and new applicable analyses are created.

---

### User Story 2 - Review opportunities in Telegram (Priority: P2)

As an allowlisted family member, I receive candidate-specific opportunity cards and can mark each one as interesting, dismissed, applied, or globally closed.

**Why this priority**: Telegram is the intended first user interface and closes the feedback loop without requiring a web application.

**Independent Test**: Configure a test recipient, deliver a qualifying stored analysis, invoke every callback twice, and verify the visible response and single current state.

**Acceptance Scenarios**:

1. **Given** a validated `review` or `high_match` analysis, **When** delivery is scheduled, **Then** the assigned chat receives a card containing candidate, score, verdict, job facts, reasons, risks, Work Permit status, source, link, and dates.
2. **Given** an allowlisted user presses a feedback button for an authorized profile, **When** the same action is repeated, **Then** the existing state is retained without duplicate records.
3. **Given** an unauthorized user or chat, **When** it invokes a command or callback, **Then** no protected data is disclosed and no state changes.

---

### User Story 3 - Use evidence-based external analysis (Priority: P3)

As a family member, I can enable an external job analyzer to receive richer assessments without exposing unnecessary personal data or receiving malformed and unsupported claims.

**Why this priority**: Model analysis improves ranking, but it must never weaken correctness, privacy, or the ability to run locally.

**Independent Test**: Feed valid, malformed, contradictory, and empty analyzer responses through the adapter and verify validation, bounded retry, failure state, and non-delivery behavior.

**Acceptance Scenarios**:

1. **Given** valid provider credentials and a qualifying vacancy, **When** analysis runs, **Then** only pseudonymous relevant profile facts are sent and the validated result is stored with evidence and provider metadata.
2. **Given** invalid JSON or a score/verdict contradiction, **When** retries are exhausted, **Then** the task reaches a failed state and no unvalidated result is delivered.
3. **Given** missing provider credentials, **When** the service starts, **Then** deterministic mock analysis remains available.

---

### User Story 4 - Govern every source (Priority: P4)

As the operator, I can see and control exactly how each source may be used, and an unsupported URL is never fetched silently.

**Why this priority**: The service is an adapter-based aggregator, not an anti-bot system; compliance and auditability are product requirements.

**Independent Test**: Submit fixture, allowed manual-text, explicitly allowed manual-URL, unknown-domain, and discovery-only inputs and inspect both network behavior and retained source decisions.

**Acceptance Scenarios**:

1. **Given** a fixture source, **When** it runs, **Then** stored source content is parsed without external network access.
2. **Given** an unknown or discovery-only URL, **When** it is submitted, **Then** it becomes a Pending Manual Lead with a reason and no HTTP request occurs.
3. **Given** a URL whose policy explicitly permits one-time retrieval, **When** it is submitted, **Then** retrieval proceeds only after all network-safety checks pass.
4. **Given** the ChinaJob adapter, **When** default tests and runs execute, **Then** only saved fixtures are used and live mode remains disabled.

---

### User Story 5 - Operate locally or in the DC (Priority: P5)

As the operator, I can start the complete MVP with one documented workflow, inspect health and run statistics, and operate without the optional home device.

**Why this priority**: Repeatable operation is required before adding more sources or a web UI.

**Independent Test**: Start the documented stack on an x86_64 host with no external tokens, apply storage changes, run the demonstration twice, inspect health and statistics, and stop it cleanly.

**Acceptance Scenarios**:

1. **Given** only local configuration, **When** the stack starts, **Then** storage and the application become healthy without external credentials.
2. **Given** a source run, **When** it finishes or fails, **Then** counts, timing, worker location, HTTP summary, and categorized outcome are retained.
3. **Given** the home worker is unavailable, **When** all MVP scenarios run in the DC, **Then** no capability is lost.

### Edge Cases

- Empty, oversized, error-page, CAPTCHA, binary, or unsupported-content input is rejected with a categorized reason and retained only as allowed by policy.
- A URL resolves or redirects to loopback, private, link-local, multicast, unspecified, or metadata-network destinations.
- A source job changes its URL while retaining its source identity, or two sources publish the same vacancy.
- Title, company, or city is missing; absence remains explicit rather than being invented.
- A vacancy matches more than one candidate track or both candidate profiles.
- A high professional score lacks Work Permit evidence and must not become `high_match`.
- A dismissed vacancy changes materially; notification occurs only if its effective verdict improves.
- Salary uses monthly, annual, hourly, daily, negotiable, or extra-month notation.
- Telegram retries delivery or repeats a callback after a timeout.
- Profile, prompt, or model changes while older open vacancies remain stored.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST maintain versioned profiles for `cnstbmb` and `lanok` using the confirmed qualifications, languages, role boundaries, salary floors, location preference, and relocation window.
- **FR-002**: The system MUST support fixture, manual text, and policy-gated manual URL acquisition in the MVP.
- **FR-003**: The system MUST define contracts for public HTTP, email, search discovery, manual URL, manual text, browser, and fixture source modes without enabling unapproved collection.
- **FR-004**: Every source MUST have a dated policy declaring enabled modes, limits, authentication needs, and worker location.
- **FR-005**: Unknown, forbidden, or discovery-only URLs MUST be retained as Pending Manual Leads without a network request.
- **FR-006**: The ChinaJob source MUST operate from saved fixtures by default and MUST NOT make live requests until policy records explicit permission.
- **FR-007**: The system MUST preserve bounded original source content separately from normalized vacancies and MUST NOT duplicate unchanged raw snapshots.
- **FR-008**: The system MUST normalize identity, employer, location, work arrangement, employment type, salary, publication dates, description, languages, Work Permit evidence, relocation, housing, tracks, and lifecycle status without inventing missing facts.
- **FR-009**: A job MUST have one primary candidate track and MAY have additional tracks.
- **FR-010**: Deduplication MUST apply source identity, canonical URL, normalized employer/title/city, and text similarity in that order.
- **FR-011**: Deterministic matches MUST merge into a canonical job; text similarity alone MUST create a Possible Duplicate rather than auto-merge.
- **FR-012**: Material content changes MUST create immutable job versions; observation-only changes MUST update last-seen metadata without versioning.
- **FR-013**: Hard filters MUST execute separately for each candidate before paid analysis and MUST retain rule codes, reasons, and policy version.
- **FR-014**: Hard filters MUST reject closed, disallowed-internship, non-target-market, citizenship-conflicting, mandatory-language-conflicting, seniority-conflicting, profile-conflicting, and invalid-page inputs as defined by each profile policy.
- **FR-015**: Russian-language requirements MUST be treated as compatible for both profiles and as a positive signal for otherwise relevant `cnstbmb` IT roles.
- **FR-016**: English requirements above B1 for `cnstbmb` MUST be a risk rather than an automatic rejection unless the vacancy explicitly makes the mismatch disqualifying.
- **FR-017**: English-teaching roles for `lanok` MUST remain a legal-risk watchlist unless the employer provides direct evidence of a lawful path for this candidate.
- **FR-018**: Administrative Support roles for `lanok` MUST include assistant, secretary, office, school, international-department, and coordination work while excluding unrelated specialist management by default.
- **FR-019**: Analysis MUST be independently keyed by job version, candidate-profile version, prompt version, and model.
- **FR-020**: The system MUST provide deterministic mock analysis by default and optional external analysis through the same contract.
- **FR-021**: External analysis MUST request JSON-only output, validate it strictly, reject score/verdict contradictions, perform bounded retries, and move exhausted work to a failed state.
- **FR-022**: Analysis MUST separate professional fit score from Work Permit risk; unknown sponsorship caps verdict at `review`, direct support evidence permits `high_match`, and explicit refusal rejects the vacancy.
- **FR-023**: Important analysis conclusions MUST include short quotes from the vacancy and MUST distinguish facts from inferences.
- **FR-024**: External analyzers MUST receive no real names, contacts, messaging identifiers, or unrelated family information.
- **FR-025**: The system MUST record analysis version, model, prompt hash, latency, token usage when available, provider request ID when available, and sanitized failure diagnostics without full reasoning.
- **FR-026**: Only validated `review` and `high_match` analyses MUST be automatically notified; `watch` remains available on demand and `reject` is not presented as a match.
- **FR-027**: Notifications MUST be unique per analysis and notifier destination. New material versions may produce an update; unchanged versions MUST not.
- **FR-028**: A previously dismissed job MUST not be re-notified unless the effective verdict improves by at least one tier.
- **FR-029**: Telegram commands MUST include start, help, URL submission, safe text submission, latest opportunities, statistics, and profile information.
- **FR-030**: Telegram authorization MUST map user IDs to allowed candidate profiles and independently allowlist destination chats.
- **FR-031**: Feedback MUST support interested, dismissed, and applied dispositions per candidate/job; closed status MUST affect the canonical job globally.
- **FR-032**: Repeated callbacks MUST update or retain one current feedback/application state rather than create duplicates.
- **FR-033**: Applications MUST support submitted, interview, offer, rejected, withdrawn, and closed states.
- **FR-034**: The service MUST remain operable with console notification when Telegram credentials are absent.
- **FR-035**: URL retrieval MUST reject unsafe schemes and addresses before connection and after every redirect, and MUST enforce time, size, and content-type limits.
- **FR-036**: Administrative interfaces MUST remain private; any exposed liveness response MUST disclose no operational or personal detail.
- **FR-037**: Every source run MUST retain source, worker location, timing, page/job counts, duplicate/rejection counts, HTTP summary, CAPTCHA/error-page count, duration, final status, and error category.
- **FR-038**: The MVP MUST expose structured operational logs with correlation identifiers and a health status without logging secrets or full raw snapshots.
- **FR-039**: Profile, prompt, or model changes MUST NOT trigger an unbounded automatic historical analysis; the operator MUST be able to request a scoped dry-run/backfill of open jobs.
- **FR-040**: Default development and test workflows MUST make no external source, analyzer, or Telegram requests.
- **FR-041**: The system MUST support local and DC worker-location values while remaining fully functional without a home worker.
- **FR-042**: The first release MUST provide a documented single command that demonstrates fixture or manual-text ingestion through persisted analysis and console notification.
- **FR-043**: The MVP MUST NOT include a web UI, CAPTCHA bypass, fingerprint manipulation, evasive proxy rotation, private API reverse engineering, session reuse, or unapproved automated collection.

### Key Entities

- **Candidate Profile / Version**: A pseudonymous family member's confirmed career facts, constraints, preferences, and immutable assessment context.
- **Source / Source Policy**: A job origin and its dated allowed acquisition modes, limits, and unresolved permission state.
- **Source Run**: One observable acquisition attempt and its execution statistics.
- **Raw Job / Raw Snapshot**: Bounded original input and metadata retained as evidence.
- **Job / Job Version**: A canonical vacancy and its immutable material content states.
- **Possible Duplicate**: A similarity relationship requiring review rather than an automatic merge.
- **Hard Filter Result**: Candidate-specific deterministic eligibility outcome with versioned reasons.
- **Job Analysis**: Validated candidate-specific fit, verdict, evidence, risks, and provider metadata.
- **Telegram Delivery**: Idempotent delivery state for one analysis and destination.
- **Feedback**: Current candidate-specific disposition of a canonical job.
- **Application**: Candidate-specific application lifecycle for a job.
- **Pending Manual Lead**: A retained URL that policy prevented the service from retrieving.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A new operator can start the documented local stack and complete the fixture demonstration in under 15 minutes without model or Telegram credentials.
- **SC-002**: Reprocessing the same unchanged fixture 100 times produces exactly one material job version, one analysis per applicable profile/version key, and one delivery per qualifying destination.
- **SC-003**: A material description change produces exactly one additional version and one new analysis per applicable profile while preserving prior evidence.
- **SC-004**: 100% of unknown, forbidden, and discovery-only URL tests make zero outbound requests and return an actionable manual-submission explanation.
- **SC-005**: 100% of malformed, contradictory, or exhausted analyzer results remain undelivered and are visible to the operator as categorized failures.
- **SC-006**: 100% of unauthorized Telegram command and callback tests disclose no vacancy/profile content and change no state.
- **SC-007**: Every delivered match contains candidate, score, verdict, title, company, city, available salary, two to four reasons, major risks, Work Permit status, source, link, publication date, and discovery date.
- **SC-008**: All default automated tests complete with zero calls to live job sources, external analyzers, or Telegram.
- **SC-009**: Every source run exposes enough retained statistics to calculate success rate, 403/429 totals, CAPTCHA rate, latency, new-job rate, duplicate rate, analysis failures, and delivery failures.
- **SC-010**: The full MVP remains operational when every home worker and every external credential is unavailable.

## Assumptions

- The repository is private enough to retain the supplied professional profile facts, but no document numbers, birth dates, addresses, contacts, or unrelated family data will be added.
- Both candidate profiles have Russian citizenship; `cnstbmb` is a native Russian speaker with English B1 and no Chinese, while `lanok` is a native Russian speaker with English C1 and a verified HSK 4 certificate from 2019.
- `cnstbmb` has more than ten years of commercial frontend experience, five years of backend experience, limited technical leadership experience, and a 2013 mechanical-engineering degree; mechanical and teaching roles are outside scope.
- `lanok` has a 2012 primary-school and English-teaching degree, school and tutoring experience beginning in 2012, experience across grades 1–11, and an internal Russian education qualification that is not represented as an international license.
- Salary floors are preferred monthly gross values, not hard exclusions; compensation benefits may offset lower cash salary.
- Shanghai is preferred, but all Mainland China cities remain eligible. June–August 2027 is a non-binding relocation preference.
- The family prefers credible opportunities for both candidates in one city, but automated family bundling and school search are outside the MVP.
- Hong Kong and Macau remain watchlist regions because they use separate employment regimes; Taiwan is outside MVP scope.
- Live collection permission is not inferred from public accessibility or robots.txt.
