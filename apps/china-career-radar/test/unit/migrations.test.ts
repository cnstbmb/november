import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("database idempotency constraints", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "database/migrations/0000_hot_wendell_vaughn.sql"),
    "utf8",
  );
  const retryMigration = readFileSync(
    resolve(process.cwd(), "database/migrations/0002_woozy_giant_girl.sql"),
    "utf8",
  );
  test("enforces unique analysis, delivery, feedback, application, version and raw observation keys", () => {
    for (const name of [
      "job_analyses_analysis_key_unique",
      "telegram_delivery_key_uq",
      "feedback_candidate_job_uq",
      "application_candidate_job_uq",
      "job_versions_hash_uq",
      "raw_jobs_observation_uq",
    ])
      expect(migration).toContain(name);
  });
  test("enables pg_trgm and similarity index", () => {
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(migration).toContain("gin_trgm_ops");
  });
  test("bounds retries for failed candidate analyses", () => {
    expect(retryMigration).toContain(
      'ADD COLUMN "attempt_count" integer DEFAULT 1 NOT NULL',
    );
  });
});
