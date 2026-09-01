import { describe, expect, test } from "vitest";
import {
  applyAnalysisPolicy,
  DeepSeekJobAnalyzer,
} from "../../src/analysis/analyzers";
import type { CandidateProfile, JobAnalysis } from "../../src/domain";
import { analysisSchema } from "../../src/domain";
import { normalizeJob } from "../../src/normalization/normalizer";
import type { RadarConfig } from "../../src/config/config";

const job = normalizeJob({
  sourceId: "manual",
  mode: "manual_text",
  title: "Frontend Engineer",
  company: "Co",
  city: "Shanghai",
  text: "Frontend TypeScript role in Shanghai. English is the working language.",
  rawKind: "text",
  metadata: {},
});
const valid: JobAnalysis = {
  fitScore: 82,
  verdict: "high_match",
  matchedSkills: ["TypeScript"],
  missingSkills: [],
  languages: {
    required: ["English"],
    mandarinRequired: false,
    candidateRisk: "medium",
  },
  visa: { status: "unknown", workPermitRisk: "unknown" },
  legalFlags: [],
  relocation: { status: "unknown" },
  salaryAssessment: "unknown",
  reasons: ["Профильный frontend"],
  risks: [],
  evidence: [
    { field: "languages.required", quote: "English is the working language" },
  ],
  familyCity: "Shanghai",
};

describe("analysis validation", () => {
  test("strict Zod rejects unknown fields", () =>
    expect(() => analysisSchema.parse({ ...valid, surprise: true })).toThrow());
  test("unknown sponsorship caps high match to review", () =>
    expect(applyAnalysisPolicy(valid, job).verdict).toBe("review"));
  test("retries malformed JSON and accepts a subsequent valid response", async () => {
    let calls = 0;
    const transport = async () =>
      new Response(
        JSON.stringify({
          id: `r${++calls}`,
          status: "completed",
          model: "deepseek-v4-flash",
          error: null,
          output: [
            {
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: calls === 1 ? "{bad" : JSON.stringify(valid),
                },
              ],
            },
          ],
          usage: { total_tokens: 10 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const config = {
      env: {
        DEEPSEEK_MODEL: "deepseek-v4-flash",
        DEEPSEEK_BASE_URL: "https://api.deepseek.com",
        DEEPSEEK_API_KEY: "test",
        ANALYSIS_TIMEOUT_MS: 1000,
      },
      prompt: { text: "json only" },
    } as unknown as RadarConfig;
    const analyzer = new DeepSeekJobAnalyzer(config, transport as typeof fetch);
    const profile = {
      id: "cnstbmb",
      displayName: "x",
      contentHash: "x",
      definition: {},
      analyzerProjection: {
        skills: ["TypeScript"],
        languages: { english: "B1" },
        roleFamilies: ["software"],
        salaryFloorCnyMonthlyGross: 30000,
      },
    } satisfies CandidateProfile;
    const result = await analyzer.analyze(job, profile, {
      candidateId: "cnstbmb",
      promptVersion: "v1",
      promptHash: "h",
      modelRevision: "r",
    });
    expect(calls).toBe(2);
    expect(result.analysis.verdict).toBe("review");
  });
});
