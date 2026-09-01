import { describe, expect, test, vi } from "vitest";
import type { RadarConfig } from "../../src/config/config";
import type {
  ActiveProfile,
  DatabaseService,
} from "../../src/database/database";
import type {
  AnalyzerResult,
  JobAnalyzer,
  Notifier,
  NormalizedJob,
  RawJobInput,
} from "../../src/domain";
import { IngestionPipeline } from "../../src/ingestion/pipeline";
import { RadarMetrics } from "../../src/observability/radar-metrics";
import { ManualTextAdapter } from "../../src/sources/adapters";
import type { SourceAdapter } from "../../src/sources/adapters";

const profile: ActiveProfile = {
  id: "cnstbmb",
  displayName: "cnstbmb",
  contentHash: "profile-hash",
  versionId: "profile-version",
  version: 1,
  definition: {},
  analyzerProjection: {
    skills: ["TypeScript"],
    languages: { english: "B1" },
    roleFamilies: ["software_engineering"],
    salaryFloorCnyMonthlyGross: 30_000,
  },
};

const analysis: AnalyzerResult = {
  analysis: {
    fitScore: 55,
    verdict: "watch",
    matchedSkills: ["TypeScript"],
    missingSkills: [],
    languages: {
      required: ["English"],
      mandarinRequired: false,
      candidateRisk: "low",
    },
    visa: { status: "unknown", workPermitRisk: "unknown" },
    legalFlags: [],
    relocation: { status: "unknown" },
    salaryAssessment: "unknown",
    reasons: ["Профильная роль"],
    risks: [],
    evidence: [],
    familyCity: "Shanghai",
  },
  metadata: { latencyMs: 1, providerCalls: 1 },
};

describe("ingestion pipeline idempotency", () => {
  test("exposes successful analysis and Telegram delivery outcomes", async () => {
    const db = {
      syncSources: vi.fn(async () => undefined),
      beginRun: vi.fn(async () => "run-id"),
      finishRun: vi.fn(async () => undefined),
      syncProfiles: vi.fn(async () => [profile]),
      persistVersion: vi.fn(async () => ({
        jobId: "job-id",
        versionId: "version-id",
        versionNumber: 1,
        isNewJob: true,
        isNewVersion: true,
      })),
      saveFilter: vi.fn(async () => undefined),
      reserveAnalysis: vi.fn(async () => ({ id: "analysis-id" })),
      completeAnalysis: vi.fn(async () => undefined),
      failAnalysis: vi.fn(async () => undefined),
      reserveDelivery: vi.fn(async () => "delivery-id"),
      completeDelivery: vi.fn(async () => undefined),
      failDelivery: vi.fn(async () => undefined),
    } as unknown as DatabaseService;
    const config = {
      sourcePolicies: [],
      profiles: [profile],
      workerLocation: () => "dc",
      prompt: { version: "v1", hash: "prompt-hash" },
      env: {
        DEEPSEEK_MODEL_REVISION: "mock-v1",
        TELEGRAM_ALLOWED_CHAT_IDS: "-1001",
      },
    } as unknown as RadarConfig;
    const analyzer = {
      provider: "mock",
      model: "mock-v1",
      analyze: vi.fn(async () => ({
        ...analysis,
        analysis: {
          ...analysis.analysis,
          fitScore: 72,
          verdict: "review" as const,
        },
      })),
    } satisfies JobAnalyzer;
    const notify = vi.fn(async () => ({ externalId: "42" }));
    const notifier = {
      channel: "telegram",
      notify,
    } satisfies Notifier;
    const metrics = new RadarMetrics();
    const pipeline = new IngestionPipeline(
      db,
      config,
      analyzer,
      notifier,
      metrics,
    );

    const [result] = await pipeline.run(
      new ManualTextAdapter({
        title: "Senior TypeScript Engineer",
        company: "Acme",
        city: "Shanghai",
        text: "Senior TypeScript engineer role in Shanghai, China with full-time employment.",
        rawKind: "text",
        metadata: {},
      }),
    );

    expect(result).toMatchObject({ notifications: 1, failedNotifications: 0 });
    expect(metrics.render()).toContain(
      'china_career_radar_analyses_total{candidate="cnstbmb",verdict="review",status="success"} 1',
    );
    expect(metrics.render()).toContain(
      'china_career_radar_notifications_total{candidate="cnstbmb",status="sent"} 1',
    );

    notify.mockRejectedValueOnce(new Error("telegram unavailable") as never);
    const failingAdapter: SourceAdapter = {
      sourceId: "brave-discovery",
      mode: "search_discovery",
      async *collect() {
        yield {
          sourceId: "lever",
          mode: "public_http",
          sourceJobId: "job-2",
          canonicalUrl: "https://jobs.lever.co/acme/job-2",
          title: "Senior TypeScript Engineer II",
          company: "Acme",
          city: "Shanghai",
          text: "Another senior TypeScript engineer role in Shanghai, China with full-time employment.",
          rawKind: "text",
          metadata: {},
        };
      },
    };

    const [failedDelivery] = await pipeline.run(failingAdapter);

    expect(failedDelivery).toMatchObject({
      notifications: 0,
      failedNotifications: 1,
    });
    expect(db.failDelivery).toHaveBeenCalledWith(
      "delivery-id",
      expect.any(Error),
    );
    expect(metrics.render()).toContain(
      'china_career_radar_notifications_total{candidate="cnstbmb",status="failed"} 1',
    );
  });

  test("unchanged observations do not rerun analysis while changed content creates a version", async () => {
    const versions = new Map<string, { id: string; version: number }>();
    const reservedAnalyses = new Set<string>();
    const analyze = vi.fn(async () => analysis);
    const db = {
      syncSources: vi.fn(async () => undefined),
      beginRun: vi.fn(async () => "run-id"),
      finishRun: vi.fn(async () => undefined),
      syncProfiles: vi.fn(async () => [profile]),
      persistVersion: vi.fn(async (_raw: RawJobInput, job: NormalizedJob) => {
        const existing = versions.get(job.contentHash);
        if (existing)
          return {
            jobId: "job-id",
            versionId: existing.id,
            versionNumber: existing.version,
            isNewJob: false,
            isNewVersion: false,
          };
        const version = versions.size + 1;
        const stored = { id: `version-${version}`, version };
        versions.set(job.contentHash, stored);
        return {
          jobId: "job-id",
          versionId: stored.id,
          versionNumber: version,
          isNewJob: version === 1,
          isNewVersion: true,
        };
      }),
      saveFilter: vi.fn(async () => undefined),
      reserveAnalysis: vi.fn(async (versionId: string) => {
        if (reservedAnalyses.has(versionId)) return undefined;
        reservedAnalyses.add(versionId);
        return { id: `analysis-${versionId}`, key: versionId };
      }),
      completeAnalysis: vi.fn(async () => undefined),
      failAnalysis: vi.fn(async () => undefined),
      reserveDelivery: vi.fn(async () => undefined),
      completeDelivery: vi.fn(async () => undefined),
    } as unknown as DatabaseService;
    const config = {
      sourcePolicies: [],
      profiles: [profile],
      workerLocation: () => "local",
      prompt: { version: "v1", hash: "prompt-hash" },
      env: {
        DEEPSEEK_MODEL_REVISION: "mock-v1",
        TELEGRAM_ALLOWED_CHAT_IDS: "",
      },
    } as unknown as RadarConfig;
    const analyzer = {
      provider: "mock",
      model: "mock-v1",
      analyze,
    } satisfies JobAnalyzer;
    const notifier = {
      channel: "console",
      notify: vi.fn(async () => ({})),
    } satisfies Notifier;
    const pipeline = new IngestionPipeline(db, config, analyzer, notifier);
    const base =
      "Senior Frontend TypeScript role in Shanghai. English is the working language.";

    const first = await pipeline.run(
      new ManualTextAdapter({
        title: "Senior Frontend",
        company: "Example",
        city: "Shanghai",
        text: base,
        rawKind: "text",
        metadata: {},
      }),
    );
    const repeated = await pipeline.run(
      new ManualTextAdapter({
        title: "Senior Frontend",
        company: "Example",
        city: "Shanghai",
        text: base,
        rawKind: "text",
        metadata: {},
      }),
    );
    const changed = await pipeline.run(
      new ManualTextAdapter({
        title: "Senior Frontend",
        company: "Example",
        city: "Shanghai",
        text: `${base} Work permit sponsorship is available.`,
        rawKind: "text",
        metadata: {},
      }),
    );

    expect(first[0]).toMatchObject({ newVersion: true, analyses: 1 });
    expect(repeated[0]).toMatchObject({ newVersion: false, analyses: 0 });
    expect(changed[0]).toMatchObject({ newVersion: true, analyses: 1 });
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  test("an invalid analysis for one candidate does not abort an automatic discovery batch", async () => {
    const lanok: ActiveProfile = {
      ...profile,
      id: "lanok",
      displayName: "lanok",
      versionId: "lanok-version",
      analyzerProjection: {
        ...profile.analyzerProjection,
        roleFamilies: ["russian_education"],
      },
    };
    const db = {
      syncSources: vi.fn(async () => undefined),
      beginRun: vi.fn(async () => "run-id"),
      finishRun: vi.fn(async () => undefined),
      syncProfiles: vi.fn(async () => [profile, lanok]),
      persistVersion: vi.fn(async () => ({
        jobId: "job-id",
        versionId: "version-id",
        versionNumber: 1,
        isNewJob: true,
        isNewVersion: true,
      })),
      saveFilter: vi.fn(async () => undefined),
      reserveAnalysis: vi.fn(
        async (_versionId: string, profileId: string) => ({
          id: `analysis-${profileId}`,
        }),
      ),
      completeAnalysis: vi.fn(async () => undefined),
      failAnalysis: vi.fn(async () => undefined),
      reserveDelivery: vi.fn(async () => undefined),
      completeDelivery: vi.fn(async () => undefined),
    } as unknown as DatabaseService;
    const config = {
      sourcePolicies: [],
      profiles: [profile, lanok],
      workerLocation: () => "dc",
      prompt: { version: "v1", hash: "prompt-hash" },
      env: {
        DEEPSEEK_MODEL_REVISION: "mock-v1",
        TELEGRAM_ALLOWED_CHAT_IDS: "",
      },
    } as unknown as RadarConfig;
    const analyzer = {
      provider: "mock",
      model: "mock-v1",
      analyze: vi.fn<JobAnalyzer["analyze"]>(
        async (_job, _profile, context) => {
          if (context.candidateId === "cnstbmb")
            throw new Error("analysis_evidence_missing:Salary range");
          return analysis;
        },
      ),
    } satisfies JobAnalyzer;
    const notifier = {
      channel: "console",
      notify: vi.fn(async () => ({})),
    } satisfies Notifier;
    const pipeline = new IngestionPipeline(db, config, analyzer, notifier);
    const adapter: SourceAdapter = {
      sourceId: "brave-discovery",
      mode: "search_discovery",
      async *collect() {
        yield {
          sourceId: "lever",
          mode: "public_http",
          sourceJobId: "job-1",
          canonicalUrl: "https://jobs.lever.co/acme/job-1",
          title: "TypeScript Engineer and Primary School Technology Teacher",
          company: "Acme School",
          city: "Shanghai",
          text: "TypeScript engineer and Russian primary school teacher role in Shanghai, China with full-time employment.",
          rawKind: "text",
          metadata: {},
        };
      },
    };

    const results = await pipeline.run(adapter);

    expect(results[0]).toMatchObject({
      newVersion: true,
      analyses: 1,
      failedAnalyses: 1,
    });
    expect(db.finishRun).toHaveBeenLastCalledWith(
      "run-id",
      expect.objectContaining({ status: "succeeded" }),
    );
  });

  test("an unchanged discovered job completes a candidate analysis missed by an earlier interrupted run", async () => {
    const db = {
      syncSources: vi.fn(async () => undefined),
      beginRun: vi.fn(async () => "recovery-run"),
      finishRun: vi.fn(async () => undefined),
      syncProfiles: vi.fn(async () => [profile]),
      persistVersion: vi.fn(async () => ({
        jobId: "existing-job",
        versionId: "existing-version",
        versionNumber: 1,
        isNewJob: false,
        isNewVersion: false,
      })),
      saveFilter: vi.fn(async () => undefined),
      reserveAnalysis: vi.fn(async () => ({
        id: "missing-analysis",
      })),
      completeAnalysis: vi.fn(async () => undefined),
      failAnalysis: vi.fn(async () => undefined),
      reserveDelivery: vi.fn(async () => undefined),
      completeDelivery: vi.fn(async () => undefined),
    } as unknown as DatabaseService;
    const config = {
      sourcePolicies: [],
      profiles: [profile],
      workerLocation: () => "dc",
      prompt: { version: "v1", hash: "prompt-hash" },
      env: {
        DEEPSEEK_MODEL_REVISION: "mock-v1",
        TELEGRAM_ALLOWED_CHAT_IDS: "",
      },
    } as unknown as RadarConfig;
    const analyzer = {
      provider: "mock",
      model: "mock-v1",
      analyze: vi.fn(async () => analysis),
    } satisfies JobAnalyzer;
    const pipeline = new IngestionPipeline(db, config, analyzer, {
      channel: "console",
      notify: vi.fn(async () => ({})),
    });
    const adapter: SourceAdapter = {
      sourceId: "brave-discovery",
      mode: "search_discovery",
      async *collect() {
        yield {
          sourceId: "lever",
          mode: "public_http",
          sourceJobId: "existing-job",
          canonicalUrl: "https://jobs.lever.co/acme/existing-job",
          title: "Senior TypeScript Engineer",
          company: "Acme",
          city: "Shanghai",
          text: "Senior TypeScript engineer role in Shanghai, China with full-time employment.",
          rawKind: "text",
          metadata: {},
        };
      },
    };

    const results = await pipeline.run(adapter);

    expect(results[0]).toMatchObject({
      newVersion: false,
      analyses: 1,
      failedAnalyses: 0,
    });
  });
});
