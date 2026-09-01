import type { RawJobInput } from "../domain";
import type { IngestionPipeline, PipelineResult } from "../ingestion/pipeline";
import type { SourceAdapter } from "../sources/adapters";
import type { DiscoveredJobLead } from "./brave-search.provider";

export interface VacancySearchProvider {
  search(query: string): Promise<DiscoveredJobLead[]>;
}

export interface DiscoveryJobFetcher {
  fetch(lead: DiscoveredJobLead): Promise<RawJobInput>;
}

export interface DiscoveryIngestionRunner {
  run(adapter: SourceAdapter): Promise<PipelineResult[]>;
}

export interface DiscoverySearchPlan {
  id: string;
  candidateIds: string[];
  queries: string[];
}

export interface DiscoveryRunSummary {
  tracks: string[];
  candidateIds: string[];
  queriesAttempted: number;
  failedQueries: number;
  discoveredLeads: number;
  uniqueLeads: number;
  fetchedJobs: number;
  failedFetches: number;
  processedJobs: number;
  newVersions: number;
  analyses: number;
  failedAnalyses: number;
  notifications: number;
  failedNotifications: number;
}

class DiscoveryBatchAdapter implements SourceAdapter {
  readonly sourceId = "brave-discovery";
  readonly mode = "search_discovery" as const;
  constructor(private readonly jobs: RawJobInput[]) {}
  async *collect(): AsyncIterable<RawJobInput> {
    yield* this.jobs;
  }
}

export class DiscoveryService {
  constructor(
    private readonly searchProvider: VacancySearchProvider,
    private readonly jobFetcher: DiscoveryJobFetcher,
    private readonly ingestion: DiscoveryIngestionRunner | IngestionPipeline,
    private readonly plans: DiscoverySearchPlan[],
  ) {}

  async run(): Promise<DiscoveryRunSummary> {
    const leads = new Map<
      string,
      {
        lead: DiscoveredJobLead;
        tracks: Set<string>;
        candidateIds: Set<string>;
      }
    >();
    let discoveredLeads = 0;
    let queriesAttempted = 0;
    let failedQueries = 0;
    for (const plan of this.plans) {
      for (const query of plan.queries) {
        queriesAttempted++;
        try {
          for (const lead of await this.searchProvider.search(query)) {
            discoveredLeads++;
            const entry = leads.get(lead.canonicalUrl) ?? {
              lead,
              tracks: new Set<string>(),
              candidateIds: new Set<string>(),
            };
            entry.tracks.add(plan.id);
            for (const candidateId of plan.candidateIds)
              entry.candidateIds.add(candidateId);
            leads.set(lead.canonicalUrl, entry);
          }
        } catch {
          failedQueries++;
        }
      }
    }
    const jobs: RawJobInput[] = [];
    let failedFetches = 0;
    for (const entry of leads.values()) {
      try {
        const job = await this.jobFetcher.fetch(entry.lead);
        jobs.push({
          ...job,
          metadata: {
            ...job.metadata,
            discoveryTracks: [...entry.tracks],
            discoveryCandidateIds: [...entry.candidateIds],
          },
        });
      } catch {
        failedFetches++;
      }
    }
    const results = await this.ingestion.run(new DiscoveryBatchAdapter(jobs));
    return {
      tracks: this.plans.map((plan) => plan.id),
      candidateIds: [
        ...new Set(this.plans.flatMap((plan) => plan.candidateIds)),
      ],
      queriesAttempted,
      failedQueries,
      discoveredLeads,
      uniqueLeads: leads.size,
      fetchedJobs: jobs.length,
      failedFetches,
      processedJobs: results.length,
      newVersions: results.filter((result) => result.newVersion).length,
      analyses: results.reduce((sum, result) => sum + result.analyses, 0),
      failedAnalyses: results.reduce(
        (sum, result) => sum + result.failedAnalyses,
        0,
      ),
      notifications: results.reduce(
        (sum, result) => sum + result.notifications,
        0,
      ),
      failedNotifications: results.reduce(
        (sum, result) => sum + result.failedNotifications,
        0,
      ),
    };
  }
}
