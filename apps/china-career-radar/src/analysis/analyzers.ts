import { createHash } from "node:crypto";
import { z } from "zod";
import {
  analysisSchema,
  type AnalysisContext,
  type AnalyzerResult,
  type CandidateProfile,
  type JobAnalysis,
  type JobAnalyzer,
  type NormalizedJob,
} from "../domain";
import type { RadarConfig } from "../config/config";

const tierFor = (score: number): JobAnalysis["verdict"] =>
  score >= 80
    ? "high_match"
    : score >= 60
      ? "review"
      : score >= 40
        ? "watch"
        : "reject";

export function applyAnalysisPolicy(
  input: JobAnalysis,
  job: NormalizedJob,
): JobAnalysis {
  const expected = tierFor(input.fitScore);
  if (input.verdict !== expected)
    throw new Error(`analysis_verdict_mismatch:${input.verdict}:${expected}`);
  for (const item of input.evidence)
    if (
      !job.normalizedDescription.includes(
        item.quote.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase(),
      )
    )
      throw new Error(`analysis_evidence_missing:${item.field}`);
  if (job.visaStatus === "unsupported")
    return {
      ...input,
      verdict: "reject",
      visa: { status: "unsupported", workPermitRisk: "high" },
      legalFlags: [
        ...new Set([
          ...input.legalFlags,
          "Employer explicitly does not support lawful employment",
        ]),
      ],
    };
  if (job.visaStatus !== "confirmed" && input.verdict === "high_match")
    return {
      ...input,
      verdict: "review",
      visa: { status: "unknown", workPermitRisk: "unknown" },
      risks: [
        ...new Set([...input.risks, "Work Permit support is not mentioned"]),
      ],
    };
  return {
    ...input,
    visa: {
      status: job.visaStatus,
      workPermitRisk: job.visaStatus === "confirmed" ? "low" : "unknown",
    },
  };
}

export class MockJobAnalyzer implements JobAnalyzer {
  readonly provider = "mock";
  readonly model = "mock-v1";
  async analyze(
    job: NormalizedJob,
    profile: CandidateProfile,
  ): Promise<AnalyzerResult> {
    const started = Date.now();
    const skills = profile.analyzerProjection.skills.filter((skill) =>
      job.normalizedDescription.includes(skill.toLowerCase()),
    );
    const relevant =
      profile.id === "cnstbmb"
        ? job.candidateTracks.includes("software_engineering")
        : job.candidateTracks.some((track) =>
            [
              "russian_education",
              "primary_education",
              "english_teaching_watch",
              "administrative_support",
            ].includes(track),
          );
    let score = relevant ? 64 : 25;
    score += Math.min(skills.length * 4, 16);
    if (job.city.toLowerCase() === "shanghai") score += 5;
    if (
      job.salaryMin &&
      job.salaryMin >= profile.analyzerProjection.salaryFloorCnyMonthlyGross
    )
      score += 8;
    if (job.visaStatus === "confirmed") score += 8;
    score = Math.min(score, 100);
    const quote = job.description.slice(
      0,
      Math.min(180, job.description.length),
    );
    const initial: JobAnalysis = {
      fitScore: score,
      verdict: tierFor(score),
      matchedSkills: skills.slice(0, 20),
      missingSkills: [],
      languages: {
        required: job.languages,
        mandarinRequired: /mandarin|chinese|中文|普通话/i.test(job.description),
        candidateRisk: "unknown",
      },
      visa: {
        status: job.visaStatus,
        workPermitRisk: job.visaStatus === "confirmed" ? "low" : "unknown",
      },
      legalFlags: [],
      relocation: { status: job.relocation },
      salaryAssessment: !job.salaryMin
        ? "unknown"
        : job.salaryMin >= profile.analyzerProjection.salaryFloorCnyMonthlyGross
          ? "meets_floor"
          : job.housing === "confirmed"
            ? "compensated_by_benefits"
            : "below_floor",
      reasons: [
        relevant
          ? "Роль соответствует основному карьерному направлению"
          : "Совпадение с профилем ограничено",
        ...(skills.length
          ? [`Совпали навыки: ${skills.slice(0, 4).join(", ")}`]
          : []),
      ],
      risks:
        job.visaStatus === "unknown" ? ["Work Permit support не указан"] : [],
      evidence: quote ? [{ field: "job.description", quote }] : [],
      familyCity: job.city === "Unknown" ? null : job.city,
    };
    return {
      analysis: applyAnalysisPolicy(initial, job),
      metadata: { latencyMs: Date.now() - started, providerCalls: 1 },
    };
  }
}

const envelopeSchema = z.object({
  id: z.string(),
  status: z.enum(["in_progress", "completed", "incomplete", "failed"]),
  model: z.string(),
  error: z.unknown().nullable(),
  output: z.array(
    z.object({
      type: z.string(),
      status: z.string().optional(),
      role: z.string().optional(),
      content: z
        .array(z.object({ type: z.string(), text: z.string() }))
        .optional(),
    }),
  ),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      input_tokens_details: z
        .object({ cached_tokens: z.number().optional() })
        .optional(),
      output_tokens: z.number().optional(),
      output_tokens_details: z
        .object({ reasoning_tokens: z.number().optional() })
        .optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

export class DeepSeekJobAnalyzer implements JobAnalyzer {
  readonly provider = "deepseek";
  readonly model: string;
  constructor(
    private readonly config: RadarConfig,
    private readonly transport: typeof fetch = fetch,
  ) {
    this.model = config.env.DEEPSEEK_MODEL;
  }

  async analyze(
    job: NormalizedJob,
    profile: CandidateProfile,
    context: AnalysisContext,
  ): Promise<AnalyzerResult> {
    const started = Date.now();
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          this.config.env.ANALYSIS_TIMEOUT_MS,
        );
        const subject = createHash("sha256")
          .update(context.promptHash + context.modelRevision)
          .digest("hex");
        const response = await this.transport(
          `${this.config.env.DEEPSEEK_BASE_URL}/responses`,
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              authorization: `Bearer ${this.config.env.DEEPSEEK_API_KEY}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: this.model,
              instructions: this.config.prompt.text,
              input: JSON.stringify({
                capabilities: profile.analyzerProjection,
                vacancy: redact(job.description),
              }),
              reasoning: { effort: "none" },
              temperature: 0,
              max_output_tokens: 2000,
              text: {
                format: {
                  type: "json_schema",
                  name: "job_analysis_v1",
                  schema: z.toJSONSchema(analysisSchema),
                },
              },
              user: subject,
            }),
          },
        ).finally(() => clearTimeout(timeout));
        if ([400, 401, 402, 422].includes(response.status))
          throw new PermanentAnalysisError(`deepseek_http_${response.status}`);
        if (!response.ok) throw new Error(`deepseek_http_${response.status}`);
        const envelope = envelopeSchema.parse(await response.json());
        if (envelope.status !== "completed" || envelope.error)
          throw new Error(`deepseek_status_${envelope.status}`);
        const text = envelope.output
          .filter(
            (item) => item.type === "message" && item.status === "completed",
          )
          .flatMap((item) => item.content ?? [])
          .filter((item) => item.type === "output_text")
          .map((item) => item.text)
          .join("")
          .trim();
        if (!text) throw new Error("deepseek_empty_output");
        const analysis = applyAnalysisPolicy(
          analysisSchema.parse(JSON.parse(text)),
          job,
        );
        const usage = envelope.usage;
        return {
          analysis,
          metadata: {
            providerResponseId: envelope.id,
            latencyMs: Date.now() - started,
            providerCalls: attempt,
            inputTokens: usage?.input_tokens,
            cachedTokens: usage?.input_tokens_details?.cached_tokens,
            outputTokens: usage?.output_tokens,
            reasoningTokens: usage?.output_tokens_details?.reasoning_tokens,
            totalTokens: usage?.total_tokens,
          },
        };
      } catch (error) {
        lastError = error;
        if (error instanceof PermanentAnalysisError || attempt === 3) break;
        await new Promise((done) =>
          setTimeout(done, Math.random() * 2 ** attempt * 500),
        );
      }
    }
    throw new Error(
      `deepseek_analysis_failed:${lastError instanceof Error ? lastError.message : "unknown"}`,
    );
  }
}

class PermanentAnalysisError extends Error {}
const redact = (text: string): string =>
  text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/(?:\+?\d[\d\s()-]{7,}\d)/g, "[redacted-phone]");
