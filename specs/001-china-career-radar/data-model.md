# Data Model: China Career Radar MVP

All timestamps are UTC `timestamptz`; external identifiers are text; internal identifiers are UUIDs. JSON objects are schema-validated before persistence. Large source content is never logged.

## Candidate profiles

### `candidate_profiles`

- `id text primary key` — `cnstbmb` or `lanok`
- `display_name text not null`
- `active_version_id uuid null`
- `created_at`, `updated_at`

### `candidate_profile_versions`

- `id uuid primary key`
- `candidate_id text references candidate_profiles`
- `version integer not null`
- `content_hash text not null`
- `profile jsonb not null` — full local validated profile
- `analyzer_projection jsonb not null` — privacy-safe capabilities only
- `created_at`
- Unique: `(candidate_id, version)`, `(candidate_id, content_hash)`

State: YAML semantic change creates a new row and advances `active_version_id`; prior analyses retain their referenced version.

## Sources and acquisition

### `sources`

- `id text primary key`
- `display_name text not null`
- `enabled boolean not null`
- `policy_status text` — `approved | pending | blocked`
- `policy_version text not null`
- `policy_hash text not null`
- `policy jsonb not null`
- `created_at`, `updated_at`

### `source_runs`

- `id uuid primary key`
- `source_id text references sources`
- `mode text`
- `worker_location text` — `local | dc | home`
- `policy_version text`
- `request_id text`
- `started_at`, `finished_at`
- Counters: `fetched_pages`, `discovered_jobs`, `new_jobs`, `changed_jobs`, `duplicate_jobs`, `rejected_jobs`, `captcha_error_pages`
- `http_status_summary jsonb`
- `duration_ms integer`
- `status text` — `running | succeeded | partial | failed`
- `error_category text null`, `error_detail jsonb null`

### `raw_jobs`

- `id uuid primary key`
- `source_id text references sources`
- `source_run_id uuid null references source_runs`
- `job_id uuid null references jobs`
- `mode text`
- `source_job_id text null`
- `submitted_url text null`
- `canonical_url text null`
- `raw_kind text` — `text | html | json | url`
- `raw_text text null`, `raw_payload jsonb null`
- `content_hash text not null`
- `disposition text` — `accepted | duplicate | rejected | pending_manual`
- `reason_code text null`
- `metadata jsonb not null`
- `observed_at`, `created_at`
- Unique observation: `(source_id, content_hash, coalesce(source_job_id, ''), coalesce(canonical_url, ''))`

Pending Manual Leads are `raw_jobs` with `disposition = pending_manual`, no `job_id`, and a policy reason. No separate table is needed.

## Canonical jobs and versions

### `jobs`

- `id uuid primary key`
- `primary_source_id text references sources`
- `source_job_id text null`
- `canonical_url text null`
- `title`, `company`, `city`, `province`, `country`
- `work_mode`, `employment_type`
- `salary_min`, `salary_max numeric null`
- `salary_currency`, `salary_period`, `salary_raw`
- `published_at null`, `first_seen_at`, `last_seen_at`, `closed_at null`
- `description`, `normalized_description`, `content_hash`
- `languages jsonb`, `visa_status`, `relocation`, `housing`
- `primary_track text`, `candidate_tracks text[]`
- `status text` — `open | closed | pending_manual`
- `current_version_id uuid null`
- `created_at`, `updated_at`
- Partial unique identity indexes for `(primary_source_id, source_job_id)` and `canonical_url` when present

### `job_versions`

- `id uuid primary key`
- `job_id uuid references jobs`
- `version integer not null`
- `content_hash text not null`
- `snapshot jsonb not null` — all material normalized fields
- `created_from_raw_job_id uuid references raw_jobs`
- `created_at`
- Unique: `(job_id, version)`, `(job_id, content_hash)`

Material fields are title, company, canonical location, work/employment mode, salary facts, publication date, descriptions, languages, visa/relocation/housing evidence, and tracks. Observation time and source-run metadata do not create a version.

### `possible_duplicates`

- `id uuid primary key`
- `job_id uuid references jobs`
- `possible_job_id uuid references jobs`
- `method text` — `pg_trgm_description`
- `score numeric not null`
- `status text` — `pending | confirmed | dismissed`
- `created_at`, `reviewed_at null`
- Unique unordered job pair

Similarity never merges rows automatically.

## Filtering and analysis

### `hard_filter_results`

- `id uuid primary key`
- `job_version_id uuid references job_versions`
- `candidate_profile_version_id uuid references candidate_profile_versions`
- `policy_version text not null`
- `passed boolean not null`
- `reasons jsonb not null` — bounded `{code, message, evidence?}[]`
- `created_at`
- Unique: `(job_version_id, candidate_profile_version_id, policy_version)`

### `job_analyses`

- `id uuid primary key`
- `job_version_id uuid references job_versions`
- `candidate_profile_version_id uuid references candidate_profile_versions`
- `prompt_version`, `prompt_hash`, `provider`, `model`, `provider_model_revision`
- `analysis_key text not null unique`
- `status text` — `pending | completed | failed | dead_letter`
- `fit_score integer null`, `verdict text null`
- `analysis jsonb null` — only strict validated output
- `provider_response_id text null`
- Token counters: `input_tokens`, `cached_tokens`, `output_tokens`, `reasoning_tokens`, `total_tokens`
- `latency_ms integer null`, `provider_calls integer not null default 0`
- `failure_category text null`, `failure_diagnostics jsonb null`
- `created_at`, `completed_at null`, `updated_at`
- Unique key components: job version + profile version + prompt version/hash + model revision

No raw invalid model output or reasoning is stored. Diagnostics contain issue paths, output hash/length, and provider status only.

## Notification and user decisions

### `telegram_deliveries`

- `id uuid primary key`
- `analysis_id uuid references job_analyses`
- `chat_id text not null`
- `message_id text null`
- `status text` — `pending | sent | failed`
- `attempt_count integer`
- `last_error_category text null`
- `created_at`, `sent_at null`, `updated_at`
- Unique: `(analysis_id, chat_id)`

### `user_feedback`

- `id uuid primary key`
- `candidate_id text references candidate_profiles`
- `job_id uuid references jobs`
- `disposition text` — `interested | dismissed | applied`
- `actor_external_id_hash text null`
- `created_at`, `updated_at`
- Unique: `(candidate_id, job_id)`

### `applications`

- `id uuid primary key`
- `candidate_id text references candidate_profiles`
- `job_id uuid references jobs`
- `status text` — `submitted | interview | offer | rejected | withdrawn | closed`
- `submitted_at null`, `created_at`, `updated_at`
- Unique: `(candidate_id, job_id)`

Closing a job sets `jobs.status = closed` and `closed_at`; it is global. Applying upserts both feedback `applied` and an Application in one transaction.

## State transitions

```text
Raw Job: received -> pending_manual | rejected | accepted -> duplicate
Job: open -> closed
Analysis: pending -> completed | failed -> dead_letter
Delivery: pending -> sent | failed -> pending (retry)
Application: submitted -> interview -> offer
                         -> rejected | withdrawn | closed
Possible Duplicate: pending -> confirmed | dismissed
```

## Idempotency invariants

1. Raw observation uniqueness prevents repeated snapshot storage.
2. A job content hash is unique inside one canonical job.
3. Analysis key prevents repeat analysis for unchanged version/profile/prompt/model.
4. Delivery uniqueness prevents repeated candidate card delivery.
5. Feedback and Application are current-state upserts, not append-only duplicates.
6. Queue jobs use the same stable domain keys as singleton keys; database constraints remain authoritative.
