CREATE TABLE "possible_duplicates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"possible_job_id" uuid NOT NULL,
	"method" text NOT NULL,
	"score" numeric NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "possible_duplicates" ADD CONSTRAINT "possible_duplicates_possible_job_id_jobs_id_fk" FOREIGN KEY ("possible_job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "possible_duplicate_pair_uq" ON "possible_duplicates" USING btree ("job_id","possible_job_id");