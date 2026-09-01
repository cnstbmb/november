CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"status" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" text NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"profile" jsonb NOT NULL,
	"analyzer_projection" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"active_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hard_filter_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_version_id" uuid NOT NULL,
	"candidate_profile_version_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"passed" boolean NOT NULL,
	"reasons" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_version_id" uuid NOT NULL,
	"candidate_profile_version_id" uuid NOT NULL,
	"prompt_version" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"provider_model_revision" text NOT NULL,
	"analysis_key" text NOT NULL,
	"status" text NOT NULL,
	"fit_score" integer,
	"verdict" text,
	"analysis" jsonb,
	"provider_response_id" text,
	"input_tokens" integer,
	"cached_tokens" integer,
	"output_tokens" integer,
	"reasoning_tokens" integer,
	"total_tokens" integer,
	"latency_ms" integer,
	"provider_calls" integer DEFAULT 0 NOT NULL,
	"failure_category" text,
	"failure_diagnostics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_analyses_analysis_key_unique" UNIQUE("analysis_key")
);
--> statement-breakpoint
CREATE TABLE "job_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_from_raw_job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_source_id" text NOT NULL,
	"source_job_id" text,
	"canonical_url" text,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"city" text NOT NULL,
	"province" text,
	"country" text NOT NULL,
	"work_mode" text NOT NULL,
	"employment_type" text NOT NULL,
	"salary_min" numeric,
	"salary_max" numeric,
	"salary_currency" text,
	"salary_period" text,
	"salary_raw" text,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"description" text NOT NULL,
	"normalized_description" text NOT NULL,
	"content_hash" text NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visa_status" text NOT NULL,
	"relocation" text NOT NULL,
	"housing" text NOT NULL,
	"primary_track" text NOT NULL,
	"candidate_tracks" text[] NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"source_run_id" uuid,
	"job_id" uuid,
	"mode" text NOT NULL,
	"source_job_id" text,
	"submitted_url" text,
	"canonical_url" text,
	"raw_kind" text NOT NULL,
	"raw_text" text,
	"raw_payload" jsonb,
	"content_hash" text NOT NULL,
	"disposition" text NOT NULL,
	"reason_code" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"mode" text NOT NULL,
	"worker_location" text NOT NULL,
	"policy_version" text NOT NULL,
	"request_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched_pages" integer DEFAULT 0 NOT NULL,
	"discovered_jobs" integer DEFAULT 0 NOT NULL,
	"new_jobs" integer DEFAULT 0 NOT NULL,
	"changed_jobs" integer DEFAULT 0 NOT NULL,
	"duplicate_jobs" integer DEFAULT 0 NOT NULL,
	"rejected_jobs" integer DEFAULT 0 NOT NULL,
	"captcha_error_pages" integer DEFAULT 0 NOT NULL,
	"http_status_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_ms" integer,
	"status" text DEFAULT 'running' NOT NULL,
	"error_category" text,
	"error_detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean NOT NULL,
	"policy_status" text NOT NULL,
	"policy_version" text NOT NULL,
	"policy_hash" text NOT NULL,
	"policy" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" text,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"disposition" text NOT NULL,
	"actor_external_id_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profile_versions" ADD CONSTRAINT "candidate_profile_versions_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hard_filter_results" ADD CONSTRAINT "hard_filter_results_job_version_id_job_versions_id_fk" FOREIGN KEY ("job_version_id") REFERENCES "public"."job_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hard_filter_results" ADD CONSTRAINT "hard_filter_results_candidate_profile_version_id_candidate_profile_versions_id_fk" FOREIGN KEY ("candidate_profile_version_id") REFERENCES "public"."candidate_profile_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_analyses" ADD CONSTRAINT "job_analyses_job_version_id_job_versions_id_fk" FOREIGN KEY ("job_version_id") REFERENCES "public"."job_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_analyses" ADD CONSTRAINT "job_analyses_candidate_profile_version_id_candidate_profile_versions_id_fk" FOREIGN KEY ("candidate_profile_version_id") REFERENCES "public"."candidate_profile_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_versions" ADD CONSTRAINT "job_versions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_versions" ADD CONSTRAINT "job_versions_created_from_raw_job_id_raw_jobs_id_fk" FOREIGN KEY ("created_from_raw_job_id") REFERENCES "public"."raw_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_primary_source_id_sources_id_fk" FOREIGN KEY ("primary_source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_jobs" ADD CONSTRAINT "raw_jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_jobs" ADD CONSTRAINT "raw_jobs_source_run_id_source_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."source_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_jobs" ADD CONSTRAINT "raw_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_deliveries" ADD CONSTRAINT "telegram_deliveries_analysis_id_job_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."job_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_candidate_job_uq" ON "applications" USING btree ("candidate_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_profile_version_number_uq" ON "candidate_profile_versions" USING btree ("candidate_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_profile_version_hash_uq" ON "candidate_profile_versions" USING btree ("candidate_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "hard_filter_key_uq" ON "hard_filter_results" USING btree ("job_version_id","candidate_profile_version_id","policy_version");--> statement-breakpoint
CREATE UNIQUE INDEX "job_versions_number_uq" ON "job_versions" USING btree ("job_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "job_versions_hash_uq" ON "job_versions" USING btree ("job_id","content_hash");--> statement-breakpoint
CREATE INDEX "jobs_company_title_city_idx" ON "jobs" USING btree ("company","title","city");--> statement-breakpoint
CREATE INDEX "raw_jobs_identity_idx" ON "raw_jobs" USING btree ("source_id","source_job_id","canonical_url","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_delivery_key_uq" ON "telegram_deliveries" USING btree ("analysis_id","chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_candidate_job_uq" ON "user_feedback" USING btree ("candidate_id","job_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_source_identity_uq" ON "jobs" ("primary_source_id", "source_job_id") WHERE "source_job_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_canonical_url_uq" ON "jobs" ("canonical_url") WHERE "canonical_url" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "raw_jobs_observation_uq" ON "raw_jobs" ("source_id", COALESCE("source_job_id", ''), COALESCE("canonical_url", ''), "content_hash");
--> statement-breakpoint
CREATE INDEX "jobs_description_trgm_idx" ON "jobs" USING gin ("normalized_description" gin_trgm_ops);
