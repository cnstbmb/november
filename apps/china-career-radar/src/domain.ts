import { z } from "zod";

export const sourceModes = [
  "public_http",
  "email",
  "search_discovery",
  "manual_url",
  "manual_text",
  "browser",
  "fixture",
] as const;
export type SourceMode = (typeof sourceModes)[number];
export type WorkerLocation = "local" | "dc" | "home";

export const rawJobInputSchema = z.object({
  sourceId: z.string().min(1),
  mode: z.enum(sourceModes),
  sourceJobId: z.string().min(1).optional(),
  canonicalUrl: z.url().optional(),
  title: z.string().max(300).optional(),
  company: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  publishedAt: z.coerce.date().optional(),
  text: z.string().min(20).max(1_048_576),
  rawKind: z.enum(["text", "html", "json"]).default("text"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type RawJobInput = z.infer<typeof rawJobInputSchema>;

export type CandidateTrack =
  | "software_engineering"
  | "russian_education"
  | "primary_education"
  | "english_teaching_watch"
  | "administrative_support"
  | "other";

export interface NormalizedJob {
  sourceId: string;
  sourceJobId?: string;
  canonicalUrl?: string;
  title: string;
  company: string;
  city: string;
  province?: string;
  country: string;
  workMode: "onsite" | "hybrid" | "remote" | "unknown";
  employmentType:
    "full_time" | "part_time" | "contract" | "internship" | "unknown";
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  salaryRaw?: string;
  publishedAt?: Date;
  description: string;
  normalizedDescription: string;
  contentHash: string;
  languages: string[];
  visaStatus: "confirmed" | "unsupported" | "unknown";
  relocation: "confirmed" | "unsupported" | "unknown";
  housing: "confirmed" | "unsupported" | "unknown";
  primaryTrack: CandidateTrack;
  candidateTracks: CandidateTrack[];
}

export interface CandidateProfile {
  id: string;
  displayName: string;
  contentHash: string;
  definition: Record<string, unknown>;
  analyzerProjection: {
    skills: string[];
    languages: Record<string, string>;
    roleFamilies: string[];
    salaryFloorCnyMonthlyGross: number;
  };
}

export interface HardFilterReason {
  code: string;
  message: string;
  evidence?: string;
}
export interface HardFilterResult {
  passed: boolean;
  reasons: HardFilterReason[];
  policyVersion: string;
}

export const analysisSchema = z.strictObject({
  fitScore: z.number().int().min(0).max(100),
  verdict: z.enum(["reject", "watch", "review", "high_match"]),
  matchedSkills: z.array(z.string().max(120)).max(20),
  missingSkills: z.array(z.string().max(120)).max(20),
  languages: z.strictObject({
    required: z.array(z.string().max(80)).max(10),
    mandarinRequired: z.boolean(),
    candidateRisk: z.enum(["low", "medium", "high", "unknown"]),
  }),
  visa: z.strictObject({
    status: z.enum(["confirmed", "unsupported", "unknown"]),
    workPermitRisk: z.enum(["low", "medium", "high", "unknown"]),
  }),
  legalFlags: z.array(z.string().max(240)).max(10),
  relocation: z.strictObject({
    status: z.enum(["confirmed", "unsupported", "unknown"]),
  }),
  salaryAssessment: z.enum([
    "below_floor",
    "meets_floor",
    "above_floor",
    "compensated_by_benefits",
    "unknown",
  ]),
  reasons: z.array(z.string().max(300)).min(1).max(4),
  risks: z.array(z.string().max(300)).max(6),
  evidence: z
    .array(
      z.strictObject({
        field: z.string().max(120),
        quote: z.string().max(400),
      }),
    )
    .max(12),
  familyCity: z.string().max(120).nullable(),
});
export type JobAnalysis = z.infer<typeof analysisSchema>;

export interface AnalysisContext {
  candidateId: string;
  promptVersion: string;
  promptHash: string;
  modelRevision: string;
}
export interface AnalyzerMetadata {
  providerResponseId?: string;
  latencyMs: number;
  providerCalls: number;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}
export interface AnalyzerResult {
  analysis: JobAnalysis;
  metadata: AnalyzerMetadata;
}
export interface JobAnalyzer {
  readonly provider: string;
  readonly model: string;
  analyze(
    job: NormalizedJob,
    profile: CandidateProfile,
    context: AnalysisContext,
  ): Promise<AnalyzerResult>;
}
export interface JobCard {
  analysisId: string;
  candidateId: string;
  jobId: string;
  updated: boolean;
  text: string;
}
export interface Notifier {
  readonly channel: string;
  notify(card: JobCard, destination: string): Promise<{ externalId?: string }>;
}
