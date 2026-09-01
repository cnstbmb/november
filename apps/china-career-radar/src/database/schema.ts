import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const times = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const candidateProfiles = pgTable("candidate_profiles", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  activeVersionId: uuid("active_version_id"),
  ...times,
});
export const candidateProfileVersions = pgTable(
  "candidate_profile_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidateProfiles.id),
    version: integer("version").notNull(),
    contentHash: text("content_hash").notNull(),
    profile: jsonb("profile").notNull(),
    analyzerProjection: jsonb("analyzer_projection").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("candidate_profile_version_number_uq").on(
      t.candidateId,
      t.version,
    ),
    uniqueIndex("candidate_profile_version_hash_uq").on(
      t.candidateId,
      t.contentHash,
    ),
  ],
);
export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  enabled: boolean("enabled").notNull(),
  policyStatus: text("policy_status").notNull(),
  policyVersion: text("policy_version").notNull(),
  policyHash: text("policy_hash").notNull(),
  policy: jsonb("policy").notNull(),
  ...times,
});
export const sourceRuns = pgTable("source_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id),
  mode: text("mode").notNull(),
  workerLocation: text("worker_location").notNull(),
  policyVersion: text("policy_version").notNull(),
  requestId: text("request_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  fetchedPages: integer("fetched_pages").notNull().default(0),
  discoveredJobs: integer("discovered_jobs").notNull().default(0),
  newJobs: integer("new_jobs").notNull().default(0),
  changedJobs: integer("changed_jobs").notNull().default(0),
  duplicateJobs: integer("duplicate_jobs").notNull().default(0),
  rejectedJobs: integer("rejected_jobs").notNull().default(0),
  captchaErrorPages: integer("captcha_error_pages").notNull().default(0),
  httpStatusSummary: jsonb("http_status_summary").notNull().default({}),
  durationMs: integer("duration_ms"),
  status: text("status").notNull().default("running"),
  errorCategory: text("error_category"),
  errorDetail: jsonb("error_detail"),
});
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    primarySourceId: text("primary_source_id")
      .notNull()
      .references(() => sources.id),
    sourceJobId: text("source_job_id"),
    canonicalUrl: text("canonical_url"),
    title: text("title").notNull(),
    company: text("company").notNull(),
    city: text("city").notNull(),
    province: text("province"),
    country: text("country").notNull(),
    workMode: text("work_mode").notNull(),
    employmentType: text("employment_type").notNull(),
    salaryMin: numeric("salary_min"),
    salaryMax: numeric("salary_max"),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: text("salary_period"),
    salaryRaw: text("salary_raw"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    description: text("description").notNull(),
    normalizedDescription: text("normalized_description").notNull(),
    contentHash: text("content_hash").notNull(),
    languages: jsonb("languages").notNull().default([]),
    visaStatus: text("visa_status").notNull(),
    relocation: text("relocation").notNull(),
    housing: text("housing").notNull(),
    primaryTrack: text("primary_track").notNull(),
    candidateTracks: text("candidate_tracks").array().notNull(),
    status: text("status").notNull().default("open"),
    currentVersionId: uuid("current_version_id"),
    ...times,
  },
  (t) => [index("jobs_company_title_city_idx").on(t.company, t.title, t.city)],
);
export const rawJobs = pgTable(
  "raw_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    sourceRunId: uuid("source_run_id").references(() => sourceRuns.id),
    jobId: uuid("job_id").references(() => jobs.id),
    mode: text("mode").notNull(),
    sourceJobId: text("source_job_id"),
    submittedUrl: text("submitted_url"),
    canonicalUrl: text("canonical_url"),
    rawKind: text("raw_kind").notNull(),
    rawText: text("raw_text"),
    rawPayload: jsonb("raw_payload"),
    contentHash: text("content_hash").notNull(),
    disposition: text("disposition").notNull(),
    reasonCode: text("reason_code"),
    metadata: jsonb("metadata").notNull().default({}),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("raw_jobs_identity_idx").on(
      t.sourceId,
      t.sourceJobId,
      t.canonicalUrl,
      t.contentHash,
    ),
  ],
);
export const jobVersions = pgTable(
  "job_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    version: integer("version").notNull(),
    contentHash: text("content_hash").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdFromRawJobId: uuid("created_from_raw_job_id").references(
      () => rawJobs.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("job_versions_number_uq").on(t.jobId, t.version),
    uniqueIndex("job_versions_hash_uq").on(t.jobId, t.contentHash),
  ],
);
export const possibleDuplicates = pgTable(
  "possible_duplicates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    possibleJobId: uuid("possible_job_id")
      .notNull()
      .references(() => jobs.id),
    method: text("method").notNull(),
    score: numeric("score").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("possible_duplicate_pair_uq").on(t.jobId, t.possibleJobId),
  ],
);
export const hardFilterResults = pgTable(
  "hard_filter_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobVersionId: uuid("job_version_id")
      .notNull()
      .references(() => jobVersions.id),
    candidateProfileVersionId: uuid("candidate_profile_version_id")
      .notNull()
      .references(() => candidateProfileVersions.id),
    policyVersion: text("policy_version").notNull(),
    passed: boolean("passed").notNull(),
    reasons: jsonb("reasons").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("hard_filter_key_uq").on(
      t.jobVersionId,
      t.candidateProfileVersionId,
      t.policyVersion,
    ),
  ],
);
export const jobAnalyses = pgTable("job_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobVersionId: uuid("job_version_id")
    .notNull()
    .references(() => jobVersions.id),
  candidateProfileVersionId: uuid("candidate_profile_version_id")
    .notNull()
    .references(() => candidateProfileVersions.id),
  promptVersion: text("prompt_version").notNull(),
  promptHash: text("prompt_hash").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  providerModelRevision: text("provider_model_revision").notNull(),
  analysisKey: text("analysis_key").notNull().unique(),
  status: text("status").notNull(),
  attemptCount: integer("attempt_count").notNull().default(1),
  fitScore: integer("fit_score"),
  verdict: text("verdict"),
  analysis: jsonb("analysis"),
  providerResponseId: text("provider_response_id"),
  inputTokens: integer("input_tokens"),
  cachedTokens: integer("cached_tokens"),
  outputTokens: integer("output_tokens"),
  reasoningTokens: integer("reasoning_tokens"),
  totalTokens: integer("total_tokens"),
  latencyMs: integer("latency_ms"),
  providerCalls: integer("provider_calls").notNull().default(0),
  failureCategory: text("failure_category"),
  failureDiagnostics: jsonb("failure_diagnostics"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const telegramDeliveries = pgTable(
  "telegram_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => jobAnalyses.id),
    chatId: text("chat_id").notNull(),
    messageId: text("message_id"),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCategory: text("last_error_category"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("telegram_delivery_key_uq").on(t.analysisId, t.chatId)],
);
export const userFeedback = pgTable(
  "user_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidateProfiles.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    disposition: text("disposition").notNull(),
    actorExternalIdHash: text("actor_external_id_hash"),
    ...times,
  },
  (t) => [uniqueIndex("feedback_candidate_job_uq").on(t.candidateId, t.jobId)],
);
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidateProfiles.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    status: text("status").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...times,
  },
  (t) => [
    uniqueIndex("application_candidate_job_uq").on(t.candidateId, t.jobId),
  ],
);
