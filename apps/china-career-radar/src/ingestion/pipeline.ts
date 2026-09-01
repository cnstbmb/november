import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type {
  AnalyzerResult,
  CandidateProfile,
  JobAnalyzer,
  Notifier,
  RawJobInput,
} from "../domain";
import { RadarConfig } from "../config/config";
import { DatabaseService, type ActiveProfile } from "../database/database";
import { hardFilter } from "../filtering/hard-filter";
import { normalizeJob } from "../normalization/normalizer";
import { formatJobCard } from "../notifications/notifiers";
import { RadarMetrics } from "../observability/radar-metrics";
import type { SourceAdapter } from "../sources/adapters";

export interface PipelineResult {
  runId: string;
  jobId?: string;
  versionId?: string;
  newVersion: boolean;
  analyses: number;
  failedAnalyses: number;
  notifications: number;
  failedNotifications: number;
  rejectedProfiles: string[];
}
export const JOB_ANALYZER = Symbol("JOB_ANALYZER");
export const NOTIFIER = Symbol("NOTIFIER");

@Injectable()
export class IngestionPipeline {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RadarConfig) private readonly config: RadarConfig,
    @Inject(JOB_ANALYZER) private readonly analyzer: JobAnalyzer,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    @Inject(RadarMetrics)
    private readonly metrics: RadarMetrics = new RadarMetrics(),
  ) {}

  async run(adapter: SourceAdapter): Promise<PipelineResult[]> {
    await this.db.syncSources(
      this.config.sourcePolicies as Array<Record<string, any>>,
    );
    const runId = await this.db.beginRun(
      adapter.sourceId,
      adapter.mode,
      this.config.workerLocation(),
      randomUUID(),
    );
    const results: PipelineResult[] = [];
    let discovered = 0;
    let newJobs = 0;
    let changed = 0;
    let duplicates = 0;
    let rejected = 0;
    try {
      const profiles = await this.db.syncProfiles(this.config.profiles);
      for await (const raw of adapter.collect()) {
        discovered++;
        const result = await this.process(raw, profiles, runId);
        results.push(result);
        if (result.newVersion) changed++;
        else duplicates++;
        if (result.jobId && result.newVersion) newJobs++;
        rejected += result.rejectedProfiles.length;
      }
      await this.db.finishRun(runId, {
        status: "succeeded",
        discoveredJobs: discovered,
        newJobs,
        changedJobs: changed,
        duplicateJobs: duplicates,
        rejectedJobs: rejected,
        durationMs: 0,
      });
      return results;
    } catch (error) {
      await this.db.finishRun(runId, {
        status: "failed",
        errorCategory: "pipeline_error",
        errorDetail: {
          message:
            error instanceof Error ? error.message.slice(0, 300) : "unknown",
        },
      });
      throw error;
    }
  }

  async process(
    raw: RawJobInput,
    profiles: ActiveProfile[],
    runId?: string,
  ): Promise<PipelineResult> {
    const normalized = normalizeJob(raw);
    const persisted = await this.db.persistVersion(raw, normalized, runId);
    let analyses = 0;
    let failedAnalyses = 0;
    let notifications = 0;
    let failedNotifications = 0;
    const rejectedProfiles: string[] = [];
    for (const profile of profiles) {
      const filter = hardFilter(normalized, profile);
      await this.db.saveFilter(persisted.versionId, profile.versionId, filter);
      if (!filter.passed) {
        rejectedProfiles.push(profile.id);
        for (const reason of filter.reasons)
          this.metrics.hardFilterRejected(profile.id, reason.code);
        continue;
      }
      const reservation = await this.db.reserveAnalysis(
        persisted.versionId,
        profile.versionId,
        this.config.prompt.version,
        this.config.prompt.hash,
        this.analyzer.provider,
        this.analyzer.model,
        this.config.env.DEEPSEEK_MODEL_REVISION,
      );
      if (!reservation) continue;
      let result: AnalyzerResult;
      try {
        result = await this.analyzer.analyze(normalized, profile, {
          candidateId: profile.id,
          promptVersion: this.config.prompt.version,
          promptHash: this.config.prompt.hash,
          modelRevision: this.config.env.DEEPSEEK_MODEL_REVISION,
        });
        await this.db.completeAnalysis(reservation.id, result);
        analyses++;
        this.metrics.analysisCompleted(
          profile.id,
          result.analysis.verdict,
        );
      } catch (error) {
        await this.db.failAnalysis(reservation.id, error);
        failedAnalyses++;
        this.metrics.analysisFailed(profile.id);
        if (raw.mode !== "public_http") throw error;
        continue;
      }
      if (["review", "high_match"].includes(result.analysis.verdict)) {
        const destinations =
          this.notifier.channel === "telegram"
            ? this.config.env.TELEGRAM_ALLOWED_CHAT_IDS.split(",")
                .map((value) => value.trim())
                .filter(Boolean)
            : ["console"];
        for (const destination of destinations) {
          const deliveryId = await this.db.reserveDelivery(
            reservation.id,
            destination,
          );
          if (deliveryId) {
            try {
              const receipt = await this.notifier.notify(
                formatJobCard(
                  reservation.id,
                  persisted.jobId,
                  profile.id,
                  normalized,
                  result.analysis,
                  persisted.versionNumber > 1,
                ),
                destination,
              );
              await this.db.completeDelivery(deliveryId, receipt.externalId);
              notifications++;
              this.metrics.notificationSent(profile.id);
            } catch (error) {
              await this.db.failDelivery(deliveryId, error);
              failedNotifications++;
              this.metrics.notificationFailed(profile.id);
              if (raw.mode !== "public_http") throw error;
            }
          }
        }
      }
    }
    return {
      runId: runId ?? "direct",
      jobId: persisted.jobId,
      versionId: persisted.versionId,
      newVersion: persisted.isNewVersion,
      analyses,
      failedAnalyses,
      notifications,
      failedNotifications,
      rejectedProfiles,
    };
  }
}
