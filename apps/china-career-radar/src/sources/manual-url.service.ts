import { Inject, Injectable } from "@nestjs/common";
import { RadarConfig } from "../config/config";
import { DatabaseService } from "../database/database";
import type { PipelineResult } from "../ingestion/pipeline";
import { IngestionPipeline } from "../ingestion/pipeline";
import { ManualUrlAdapter } from "./adapters";
import { SafeHttpFetcher } from "./safe-fetcher";

export type ManualUrlSubmission =
  | { disposition: "ingested"; results: PipelineResult[] }
  | {
      disposition: "pending_manual";
      id: string;
      reason: "source_policy_missing" | "source_policy_not_approved";
    };

@Injectable()
export class ManualUrlService {
  constructor(
    @Inject(RadarConfig) private readonly config: RadarConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(IngestionPipeline) private readonly pipeline: IngestionPipeline,
  ) {}

  async submit(value: string): Promise<ManualUrlSubmission> {
    const url = new URL(value);
    await this.db.syncSources(
      this.config.sourcePolicies as Array<Record<string, unknown>>,
    );
    const policy = this.config.policyForHost(url.hostname, "manual_url");

    if (!policy) {
      const id = await this.db.savePendingUrl(
        "discovery-only",
        url.toString(),
        "source_policy_missing",
      );
      return {
        disposition: "pending_manual",
        id,
        reason: "source_policy_missing",
      };
    }

    if (
      !policy.enabled ||
      policy.policyStatus !== "approved" ||
      !policy.live.enabled
    ) {
      const id = await this.db.savePendingUrl(
        policy.id,
        url.toString(),
        "source_policy_not_approved",
      );
      return {
        disposition: "pending_manual",
        id,
        reason: "source_policy_not_approved",
      };
    }

    return {
      disposition: "ingested",
      results: await this.pipeline.run(
        new ManualUrlAdapter(url.toString(), policy, new SafeHttpFetcher()),
      ),
    };
  }
}
