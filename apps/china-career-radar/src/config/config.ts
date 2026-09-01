import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { CandidateProfile, SourceMode, WorkerLocation } from "../domain";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3100),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://radar:radar@127.0.0.1:5438/radar"),
  QUEUE_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  WORKER_LOCATION: z.enum(["local", "dc", "home"]).default("local"),
  ANALYZER_PROVIDER: z.enum(["mock", "deepseek"]).default("mock"),
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_BASE_URL: z.url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
  DEEPSEEK_MODEL_REVISION: z.string().default("deepseek-v4-flash@2026-07-31"),
  ANALYSIS_PROMPT_VERSION: z.string().default("v1"),
  ANALYSIS_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  BRAVE_SEARCH_API_KEY: z.string().default(""),
  ATS_PROXY_URL: z.string().default(""),
  DISCOVERY_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  DISCOVERY_RUN_ON_STARTUP: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  DISCOVERY_INTERVAL_MINUTES: z.coerce.number().int().positive().default(360),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_PROXY_URL: z.string().default(""),
  TELEGRAM_POLLING_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  TELEGRAM_ALLOWED_CHAT_IDS: z.string().default(""),
  TELEGRAM_USER_PROFILE_MAP: z.string().default(""),
  INTERNAL_API_TOKEN: z.string().default(""),
  RADAR_CONFIG_DIR: z.string().default("config"),
  RAW_INPUT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(1_048_576)
    .default(1_048_576),
});

export type Env = z.infer<typeof envSchema>;

const sourcePolicySchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
  policyStatus: z.enum(["approved", "pending", "blocked"]),
  allowedModes: z.array(
    z.enum([
      "public_http",
      "email",
      "search_discovery",
      "manual_url",
      "manual_text",
      "browser",
      "fixture",
    ]),
  ),
  domains: z.array(z.string()).optional(),
  live: z.object({
    enabled: z.boolean(),
    approvedAt: z.unknown().nullable(),
    approvedBy: z.unknown().nullable(),
  }),
  hosts: z.object({
    exact: z.array(z.string()),
    includeSubdomains: z.boolean(),
  }),
  redirectHosts: z.array(z.string()),
  network: z.object({
    schemes: z.array(z.enum(["https", "http"])),
    ports: z.array(z.number().int()),
    maxRedirects: z.number().int(),
    timeoutMs: z.number().int(),
    maxResponseBytes: z.number().int(),
    contentTypes: z.array(z.string()),
  }),
  rateLimit: z.object({
    minIntervalSeconds: z.number(),
    maxPagesPerRun: z.number(),
    concurrency: z.number(),
  }),
  access: z.object({
    requiresAuth: z.boolean(),
    credentialsRef: z.unknown().nullable(),
  }),
  egressPolicy: z.enum(["local", "dc", "home"]),
  robots: z.object({
    url: z.string().nullable(),
    lastCheckedAt: z.unknown().nullable(),
    result: z.string(),
  }),
  terms: z.object({
    url: z.string().nullable(),
    lastCheckedAt: z.unknown().nullable(),
    evidence: z.string(),
  }),
  fixture: z.object({ enabled: z.boolean(), manifest: z.string().nullable() }),
});
export type SourcePolicy = z.infer<typeof sourcePolicySchema>;

const searchPlanSchema = z.object({
  id: z.string().min(1),
  candidateIds: z.array(z.string().min(1)).min(1),
  queries: z.array(z.string().min(1).max(400)).min(1),
});
export type SearchPlanConfig = z.infer<typeof searchPlanSchema>;

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class RadarConfig {
  readonly env: Env = envSchema.parse(process.env);
  readonly root = resolve(process.cwd(), this.env.RADAR_CONFIG_DIR);
  readonly profiles = this.loadProfiles();
  readonly sourcePolicies = this.loadPolicies();
  readonly searchPlans = this.loadSearchPlans();
  readonly prompt = this.loadPrompt();

  private loadProfiles(): CandidateProfile[] {
    return readdirSync(resolve(this.root, "profiles"))
      .filter((f) => f.endsWith(".yaml"))
      .map((file) => {
        const definition = YAML.parse(
          readFileSync(resolve(this.root, "profiles", file), "utf8"),
        ) as Record<string, any>;
        const normalized = JSON.parse(JSON.stringify(definition)) as Record<
          string,
          any
        >;
        return {
          id: String(normalized.id),
          displayName: String(normalized.displayName),
          contentHash: hash(normalized),
          definition: normalized,
          analyzerProjection: {
            skills: normalized.skills ?? normalized.roles?.include ?? [],
            languages: normalized.languages ?? {},
            roleFamilies: normalized.primaryTracks ?? [],
            salaryFloorCnyMonthlyGross: Number(
              normalized.salaryFloorCnyMonthlyGross,
            ),
          },
        };
      });
  }

  private loadPolicies(): SourcePolicy[] {
    return readdirSync(resolve(this.root, "sources"))
      .filter((f) => f.endsWith(".yaml"))
      .map((file) =>
        sourcePolicySchema.parse(
          YAML.parse(readFileSync(resolve(this.root, "sources", file), "utf8")),
        ),
      );
  }

  private loadSearchPlans(): SearchPlanConfig[] {
    return readdirSync(resolve(this.root, "queries"))
      .filter((f) => f.endsWith(".yaml"))
      .map((file) =>
        searchPlanSchema.parse(
          YAML.parse(readFileSync(resolve(this.root, "queries", file), "utf8")),
        ),
      );
  }

  private loadPrompt(): { version: string; text: string; hash: string } {
    const text = readFileSync(
      resolve(
        this.root,
        "prompts/job-analysis",
        `${this.env.ANALYSIS_PROMPT_VERSION}.md`,
      ),
      "utf8",
    );
    return {
      version: this.env.ANALYSIS_PROMPT_VERSION,
      text,
      hash: hash(text),
    };
  }

  policyForHost(hostname: string, mode: SourceMode): SourcePolicy | undefined {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    return this.sourcePolicies.find(
      (policy) =>
        policy.allowedModes.includes(mode) &&
        [...policy.hosts.exact, ...(policy.domains ?? [])].some(
          (base) =>
            host === base ||
            (policy.hosts.includeSubdomains && host.endsWith(`.${base}`)),
        ),
    );
  }

  workerLocation(): WorkerLocation {
    return this.env.WORKER_LOCATION;
  }
}
