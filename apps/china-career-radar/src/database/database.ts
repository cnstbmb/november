import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type {
  AnalyzerResult,
  CandidateProfile,
  HardFilterResult,
  JobAnalysis,
  NormalizedJob,
  RawJobInput,
} from "../domain";
import { sha256 } from "../normalization/normalizer";
import * as schema from "./schema";

export interface PersistedVersion {
  jobId: string;
  versionId: string;
  versionNumber: number;
  isNewJob: boolean;
  isNewVersion: boolean;
}
export interface ActiveProfile extends CandidateProfile {
  versionId: string;
  version: number;
}

export interface ParsedJobsPage {
  items: Array<{
    id: string;
    firstSeenAt: Date;
    title: string;
    company: string;
    city: string;
    sourceId: string;
    status: string;
    canonicalUrl: string | null;
    assessments: Array<{
      candidateId: string;
      state: "completed" | "filtered" | "pending" | "failed" | "not_evaluated";
      score?: number | null;
      verdict?: string | null;
      reasons?: Array<{ code: string; message: string }>;
      failureCategory?: string | null;
    }>;
  }>;
  page: number;
  pageSize: number;
  total: number;
}

function filterReasons(
  value: unknown,
): Array<{ code: string; message: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("code" in item) ||
      !("message" in item) ||
      typeof item.code !== "string" ||
      typeof item.message !== "string"
    )
      return [];
    return [{ code: item.code, message: item.message }];
  });
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;
  constructor() {
    this.pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        "postgres://radar:radar@127.0.0.1:5438/radar",
      max: 8,
    });
    this.db = drizzle(this.pool, { schema });
  }
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
  async ping(): Promise<void> {
    await this.pool.query("select 1");
  }

  async syncProfiles(profiles: CandidateProfile[]): Promise<ActiveProfile[]> {
    const result: ActiveProfile[] = [];
    for (const profile of profiles) {
      await this.db
        .insert(schema.candidateProfiles)
        .values({ id: profile.id, displayName: profile.displayName })
        .onConflictDoUpdate({
          target: schema.candidateProfiles.id,
          set: { displayName: profile.displayName, updatedAt: new Date() },
        });
      let [version] = await this.db
        .select()
        .from(schema.candidateProfileVersions)
        .where(
          and(
            eq(schema.candidateProfileVersions.candidateId, profile.id),
            eq(
              schema.candidateProfileVersions.contentHash,
              profile.contentHash,
            ),
          ),
        )
        .limit(1);
      if (!version) {
        const [latest] = await this.db
          .select({ version: schema.candidateProfileVersions.version })
          .from(schema.candidateProfileVersions)
          .where(eq(schema.candidateProfileVersions.candidateId, profile.id))
          .orderBy(desc(schema.candidateProfileVersions.version))
          .limit(1);
        [version] = await this.db
          .insert(schema.candidateProfileVersions)
          .values({
            candidateId: profile.id,
            version: (latest?.version ?? 0) + 1,
            contentHash: profile.contentHash,
            profile: profile.definition,
            analyzerProjection: profile.analyzerProjection,
          })
          .returning();
      }
      await this.db
        .update(schema.candidateProfiles)
        .set({ activeVersionId: version!.id, updatedAt: new Date() })
        .where(eq(schema.candidateProfiles.id, profile.id));
      result.push({
        ...profile,
        versionId: version!.id,
        version: version!.version,
      });
    }
    return result;
  }

  async syncSources(policies: Array<Record<string, any>>): Promise<void> {
    for (const policy of policies) {
      const policyHash = sha256(JSON.stringify(policy));
      await this.db
        .insert(schema.sources)
        .values({
          id: policy.id,
          displayName: policy.displayName,
          enabled: policy.enabled,
          policyStatus: policy.policyStatus,
          policyVersion: `v${policy.schemaVersion}:${policyHash.slice(0, 12)}`,
          policyHash,
          policy,
        })
        .onConflictDoUpdate({
          target: schema.sources.id,
          set: {
            displayName: policy.displayName,
            enabled: policy.enabled,
            policyStatus: policy.policyStatus,
            policyVersion: `v${policy.schemaVersion}:${policyHash.slice(0, 12)}`,
            policyHash,
            policy,
            updatedAt: new Date(),
          },
        });
    }
  }

  async beginRun(
    sourceId: string,
    mode: string,
    workerLocation: string,
    requestId: string,
  ): Promise<string> {
    const [source] = await this.db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, sourceId))
      .limit(1);
    if (!source) throw new Error(`source_not_synced:${sourceId}`);
    const [run] = await this.db
      .insert(schema.sourceRuns)
      .values({
        sourceId,
        mode,
        workerLocation,
        policyVersion: source.policyVersion,
        requestId,
      })
      .returning({ id: schema.sourceRuns.id });
    return run!.id;
  }

  async finishRun(
    id: string,
    counts: Partial<typeof schema.sourceRuns.$inferInsert> & { status: string },
  ): Promise<void> {
    await this.db
      .update(schema.sourceRuns)
      .set({ ...counts, finishedAt: new Date() })
      .where(eq(schema.sourceRuns.id, id));
  }

  async savePendingUrl(
    sourceId: string,
    url: string,
    reasonCode: string,
  ): Promise<string> {
    const contentHash = sha256(url);
    const [row] = await this.db
      .insert(schema.rawJobs)
      .values({
        sourceId,
        mode: "manual_url",
        submittedUrl: url,
        rawKind: "url",
        rawText: url,
        contentHash,
        disposition: "pending_manual",
        reasonCode,
        metadata: {},
      })
      .returning({ id: schema.rawJobs.id });
    return row!.id;
  }

  async persistVersion(
    raw: RawJobInput,
    job: NormalizedJob,
    sourceRunId?: string,
  ): Promise<PersistedVersion> {
    return this.db.transaction(async (tx) => {
      const rawHash = sha256(raw.text);
      let [rawRow] = await tx
        .insert(schema.rawJobs)
        .values({
          sourceId: raw.sourceId,
          sourceRunId,
          mode: raw.mode,
          sourceJobId: raw.sourceJobId,
          submittedUrl: raw.canonicalUrl,
          canonicalUrl: job.canonicalUrl,
          rawKind: raw.rawKind,
          rawText: raw.text,
          contentHash: rawHash,
          disposition: "accepted",
          metadata: raw.metadata,
        })
        .onConflictDoNothing()
        .returning();
      if (!rawRow)
        [rawRow] = await tx
          .select()
          .from(schema.rawJobs)
          .where(
            and(
              eq(schema.rawJobs.sourceId, raw.sourceId),
              eq(schema.rawJobs.contentHash, rawHash),
              raw.sourceJobId
                ? eq(schema.rawJobs.sourceJobId, raw.sourceJobId)
                : isNull(schema.rawJobs.sourceJobId),
              job.canonicalUrl
                ? eq(schema.rawJobs.canonicalUrl, job.canonicalUrl)
                : isNull(schema.rawJobs.canonicalUrl),
            ),
          )
          .limit(1);
      if (!rawRow) throw new Error("raw_job_idempotency_lookup_failed");
      const exact = and(
        eq(schema.jobs.company, job.company),
        eq(schema.jobs.title, job.title),
        eq(schema.jobs.city, job.city),
      );
      const identity = or(
        raw.sourceJobId
          ? and(
              eq(schema.jobs.primarySourceId, raw.sourceId),
              eq(schema.jobs.sourceJobId, raw.sourceJobId),
            )
          : undefined,
        job.canonicalUrl
          ? eq(schema.jobs.canonicalUrl, job.canonicalUrl)
          : undefined,
        exact,
      );
      let [stored] = await tx
        .select()
        .from(schema.jobs)
        .where(identity!)
        .limit(1);
      let isNewJob = false;
      const values = {
        primarySourceId: job.sourceId,
        sourceJobId: job.sourceJobId,
        canonicalUrl: job.canonicalUrl,
        title: job.title,
        company: job.company,
        city: job.city,
        province: job.province,
        country: job.country,
        workMode: job.workMode,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin?.toString(),
        salaryMax: job.salaryMax?.toString(),
        salaryCurrency: job.salaryCurrency,
        salaryPeriod: job.salaryPeriod,
        salaryRaw: job.salaryRaw,
        publishedAt: job.publishedAt,
        description: job.description,
        normalizedDescription: job.normalizedDescription,
        contentHash: job.contentHash,
        languages: job.languages,
        visaStatus: job.visaStatus,
        relocation: job.relocation,
        housing: job.housing,
        primaryTrack: job.primaryTrack,
        candidateTracks: job.candidateTracks,
      };
      if (!stored) {
        [stored] = await tx.insert(schema.jobs).values(values).returning();
        isNewJob = true;
      }
      const [existingVersion] = await tx
        .select()
        .from(schema.jobVersions)
        .where(
          and(
            eq(schema.jobVersions.jobId, stored!.id),
            eq(schema.jobVersions.contentHash, job.contentHash),
          ),
        )
        .limit(1);
      if (existingVersion) {
        await tx
          .update(schema.jobs)
          .set({ lastSeenAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.jobs.id, stored!.id));
        await tx
          .update(schema.rawJobs)
          .set({ jobId: stored!.id, disposition: "duplicate" })
          .where(eq(schema.rawJobs.id, rawRow!.id));
        return {
          jobId: stored!.id,
          versionId: existingVersion.id,
          versionNumber: existingVersion.version,
          isNewJob,
          isNewVersion: false,
        };
      }
      const [latest] = await tx
        .select({ version: schema.jobVersions.version })
        .from(schema.jobVersions)
        .where(eq(schema.jobVersions.jobId, stored!.id))
        .orderBy(desc(schema.jobVersions.version))
        .limit(1);
      const [version] = await tx
        .insert(schema.jobVersions)
        .values({
          jobId: stored!.id,
          version: (latest?.version ?? 0) + 1,
          contentHash: job.contentHash,
          snapshot: job,
          createdFromRawJobId: rawRow!.id,
        })
        .returning();
      await tx
        .update(schema.jobs)
        .set({
          ...values,
          currentVersionId: version!.id,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.jobs.id, stored!.id));
      await tx
        .update(schema.rawJobs)
        .set({ jobId: stored!.id })
        .where(eq(schema.rawJobs.id, rawRow!.id));
      if (isNewJob)
        await tx.execute(
          sql`insert into possible_duplicates (id, job_id, possible_job_id, method, score, status) select gen_random_uuid(), ${stored!.id}::uuid, j.id, 'pg_trgm_description', similarity(${job.normalizedDescription}, j.normalized_description), 'pending' from jobs j where j.id <> ${stored!.id}::uuid and similarity(${job.normalizedDescription}, j.normalized_description) >= 0.80 order by similarity(${job.normalizedDescription}, j.normalized_description) desc limit 5 on conflict do nothing`,
        );
      return {
        jobId: stored!.id,
        versionId: version!.id,
        versionNumber: version!.version,
        isNewJob,
        isNewVersion: true,
      };
    });
  }

  async saveFilter(
    versionId: string,
    profileVersionId: string,
    result: HardFilterResult,
  ): Promise<void> {
    await this.db
      .insert(schema.hardFilterResults)
      .values({
        jobVersionId: versionId,
        candidateProfileVersionId: profileVersionId,
        policyVersion: result.policyVersion,
        passed: result.passed,
        reasons: result.reasons,
      })
      .onConflictDoNothing();
  }

  async reserveAnalysis(
    versionId: string,
    profileVersionId: string,
    promptVersion: string,
    promptHash: string,
    provider: string,
    model: string,
    revision: string,
  ): Promise<{ id: string; key: string } | undefined> {
    const key = sha256(
      [versionId, profileVersionId, promptVersion, promptHash, revision].join(
        ":",
      ),
    );
    const [row] = await this.db
      .insert(schema.jobAnalyses)
      .values({
        jobVersionId: versionId,
        candidateProfileVersionId: profileVersionId,
        promptVersion,
        promptHash,
        provider,
        model,
        providerModelRevision: revision,
        analysisKey: key,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning({ id: schema.jobAnalyses.id });
    if (row) return { id: row.id, key };
    const [retry] = await this.db
      .update(schema.jobAnalyses)
      .set({
        status: "pending",
        attemptCount: sql`${schema.jobAnalyses.attemptCount} + 1`,
        failureCategory: null,
        failureDiagnostics: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.jobAnalyses.analysisKey, key),
          eq(schema.jobAnalyses.status, "failed"),
          lt(schema.jobAnalyses.attemptCount, 3),
        ),
      )
      .returning({ id: schema.jobAnalyses.id });
    return retry ? { id: retry.id, key } : undefined;
  }

  async completeAnalysis(id: string, result: AnalyzerResult): Promise<void> {
    const m = result.metadata;
    await this.db
      .update(schema.jobAnalyses)
      .set({
        status: "completed",
        fitScore: result.analysis.fitScore,
        verdict: result.analysis.verdict,
        analysis: result.analysis,
        providerResponseId: m.providerResponseId,
        latencyMs: m.latencyMs,
        providerCalls: m.providerCalls,
        inputTokens: m.inputTokens,
        cachedTokens: m.cachedTokens,
        outputTokens: m.outputTokens,
        reasoningTokens: m.reasoningTokens,
        totalTokens: m.totalTokens,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobAnalyses.id, id));
  }
  async failAnalysis(id: string, error: unknown): Promise<void> {
    await this.db
      .update(schema.jobAnalyses)
      .set({
        status: "failed",
        failureCategory: "analysis_error",
        failureDiagnostics: {
          message:
            error instanceof Error ? error.message.slice(0, 300) : "unknown",
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.jobAnalyses.id, id));
  }
  async reserveDelivery(
    analysisId: string,
    destination: string,
  ): Promise<string | undefined> {
    const [row] = await this.db
      .insert(schema.telegramDeliveries)
      .values({ analysisId, chatId: destination, status: "pending" })
      .onConflictDoNothing()
      .returning({ id: schema.telegramDeliveries.id });
    return row?.id;
  }
  async completeDelivery(id: string, externalId?: string): Promise<void> {
    await this.db
      .update(schema.telegramDeliveries)
      .set({
        status: "sent",
        messageId: externalId,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.telegramDeliveries.id, id));
  }
  async failDelivery(id: string, error: unknown): Promise<void> {
    await this.db
      .update(schema.telegramDeliveries)
      .set({
        status: "failed",
        attemptCount: sql`${schema.telegramDeliveries.attemptCount} + 1`,
        lastErrorCategory:
          error instanceof Error ? error.message.slice(0, 120) : "unknown",
        updatedAt: new Date(),
      })
      .where(eq(schema.telegramDeliveries.id, id));
  }
  async setFeedback(
    candidateId: string,
    jobId: string,
    disposition: "interested" | "dismissed" | "applied",
    actorHash?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(schema.userFeedback)
        .values({
          candidateId,
          jobId,
          disposition,
          actorExternalIdHash: actorHash,
        })
        .onConflictDoUpdate({
          target: [schema.userFeedback.candidateId, schema.userFeedback.jobId],
          set: {
            disposition,
            actorExternalIdHash: actorHash,
            updatedAt: new Date(),
          },
        });
      if (disposition === "applied")
        await tx
          .insert(schema.applications)
          .values({
            candidateId,
            jobId,
            status: "submitted",
            submittedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              schema.applications.candidateId,
              schema.applications.jobId,
            ],
            set: {
              status: "submitted",
              submittedAt: new Date(),
              updatedAt: new Date(),
            },
          });
    });
  }
  async closeJob(jobId: string): Promise<void> {
    await this.db
      .update(schema.jobs)
      .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
  }
  async jobStatus(jobId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId))
      .limit(1);
    return row?.status;
  }
  async latest(limit = 10): Promise<
    Array<{
      candidateId: string;
      jobId: string;
      title: string;
      company: string;
      city: string;
      score: number | null;
      verdict: string | null;
    }>
  > {
    const rows = await this.db
      .select({
        candidateId: schema.candidateProfileVersions.candidateId,
        jobId: schema.jobs.id,
        title: schema.jobs.title,
        company: schema.jobs.company,
        city: schema.jobs.city,
        score: schema.jobAnalyses.fitScore,
        verdict: schema.jobAnalyses.verdict,
      })
      .from(schema.jobAnalyses)
      .innerJoin(
        schema.candidateProfileVersions,
        eq(
          schema.candidateProfileVersions.id,
          schema.jobAnalyses.candidateProfileVersionId,
        ),
      )
      .innerJoin(
        schema.jobVersions,
        eq(schema.jobVersions.id, schema.jobAnalyses.jobVersionId),
      )
      .innerJoin(schema.jobs, eq(schema.jobs.id, schema.jobVersions.jobId))
      .where(eq(schema.jobAnalyses.status, "completed"))
      .orderBy(desc(schema.jobAnalyses.completedAt))
      .limit(limit);
    return rows;
  }

  async listJobsPage(
    requestedPage = 0,
    requestedPageSize = 10,
    candidateIds?: string[],
  ): Promise<ParsedJobsPage> {
    const pageSize = Math.min(10, Math.max(1, Math.floor(requestedPageSize)));
    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(schema.jobs);
    const total = Number(countRow?.total ?? 0);
    const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    const page = Math.min(
      lastPage,
      Math.max(
        0,
        Math.floor(Number.isFinite(requestedPage) ? requestedPage : 0),
      ),
    );
    const rows = await this.db
      .select({
        id: schema.jobs.id,
        currentVersionId: schema.jobs.currentVersionId,
        firstSeenAt: schema.jobs.firstSeenAt,
        title: schema.jobs.title,
        company: schema.jobs.company,
        city: schema.jobs.city,
        sourceId: schema.jobs.primarySourceId,
        status: schema.jobs.status,
        canonicalUrl: schema.jobs.canonicalUrl,
      })
      .from(schema.jobs)
      .orderBy(desc(schema.jobs.firstSeenAt), desc(schema.jobs.id))
      .limit(pageSize)
      .offset(page * pageSize);
    const versionIds = rows
      .map((row) => row.currentVersionId)
      .filter((id): id is string => Boolean(id));
    const profileRows =
      candidateIds?.length === 0
        ? []
        : await this.db
            .select({
              candidateId: schema.candidateProfiles.id,
              activeVersionId: schema.candidateProfiles.activeVersionId,
            })
            .from(schema.candidateProfiles)
            .where(
              candidateIds
                ? inArray(schema.candidateProfiles.id, candidateIds)
                : undefined,
            );
    const visibleCandidateIds = (
      candidateIds ?? profileRows.map((profile) => profile.candidateId)
    )
      .slice()
      .sort();
    const activeVersionIds = profileRows
      .map((profile) => profile.activeVersionId)
      .filter((id): id is string => Boolean(id));
    const filterRows =
      versionIds.length && activeVersionIds.length
        ? await this.db
            .select({
              jobId: schema.jobVersions.jobId,
              candidateId: schema.candidateProfileVersions.candidateId,
              passed: schema.hardFilterResults.passed,
              reasons: schema.hardFilterResults.reasons,
              createdAt: schema.hardFilterResults.createdAt,
            })
            .from(schema.hardFilterResults)
            .innerJoin(
              schema.jobVersions,
              eq(schema.jobVersions.id, schema.hardFilterResults.jobVersionId),
            )
            .innerJoin(
              schema.candidateProfileVersions,
              eq(
                schema.candidateProfileVersions.id,
                schema.hardFilterResults.candidateProfileVersionId,
              ),
            )
            .where(
              and(
                inArray(schema.hardFilterResults.jobVersionId, versionIds),
                inArray(
                  schema.hardFilterResults.candidateProfileVersionId,
                  activeVersionIds,
                ),
              ),
            )
            .orderBy(desc(schema.hardFilterResults.createdAt))
        : [];
    const analysisRows =
      versionIds.length && activeVersionIds.length
        ? await this.db
            .select({
              jobId: schema.jobVersions.jobId,
              candidateId: schema.candidateProfileVersions.candidateId,
              status: schema.jobAnalyses.status,
              score: schema.jobAnalyses.fitScore,
              verdict: schema.jobAnalyses.verdict,
              failureCategory: schema.jobAnalyses.failureCategory,
              updatedAt: schema.jobAnalyses.updatedAt,
            })
            .from(schema.jobAnalyses)
            .innerJoin(
              schema.jobVersions,
              eq(schema.jobVersions.id, schema.jobAnalyses.jobVersionId),
            )
            .innerJoin(
              schema.candidateProfileVersions,
              eq(
                schema.candidateProfileVersions.id,
                schema.jobAnalyses.candidateProfileVersionId,
              ),
            )
            .where(
              and(
                inArray(schema.jobAnalyses.jobVersionId, versionIds),
                inArray(
                  schema.jobAnalyses.candidateProfileVersionId,
                  activeVersionIds,
                ),
              ),
            )
            .orderBy(desc(schema.jobAnalyses.updatedAt))
        : [];
    const filtersByJob = new Map<
      string,
      Map<
        string,
        { passed: boolean; reasons: Array<{ code: string; message: string }> }
      >
    >();
    for (const filter of filterRows) {
      const byCandidate = filtersByJob.get(filter.jobId) ?? new Map();
      if (!byCandidate.has(filter.candidateId))
        byCandidate.set(filter.candidateId, {
          passed: filter.passed,
          reasons: filterReasons(filter.reasons),
        });
      filtersByJob.set(filter.jobId, byCandidate);
    }
    const analysesByJob = new Map<
      string,
      Map<string, (typeof analysisRows)[number]>
    >();
    for (const analysis of analysisRows) {
      const byCandidate = analysesByJob.get(analysis.jobId) ?? new Map();
      if (!byCandidate.has(analysis.candidateId))
        byCandidate.set(analysis.candidateId, analysis);
      analysesByJob.set(analysis.jobId, byCandidate);
    }
    return {
      items: rows.map(({ currentVersionId: _currentVersionId, ...job }) => ({
        ...job,
        assessments: visibleCandidateIds.map((candidateId) => {
          const analysis = analysesByJob.get(job.id)?.get(candidateId);
          if (analysis?.status === "completed")
            return {
              candidateId,
              state: "completed" as const,
              score: analysis.score,
              verdict: analysis.verdict,
            };
          if (analysis?.status === "pending")
            return { candidateId, state: "pending" as const };
          if (analysis?.status === "failed")
            return {
              candidateId,
              state: "failed" as const,
              failureCategory: analysis.failureCategory,
            };
          const filter = filtersByJob.get(job.id)?.get(candidateId);
          if (filter && !filter.passed)
            return {
              candidateId,
              state: "filtered" as const,
              reasons: filter.reasons,
            };
          return { candidateId, state: "not_evaluated" as const };
        }),
      })),
      page,
      pageSize,
      total,
    };
  }

  async stats(): Promise<Record<string, number>> {
    const [row] = await this.db
      .select({
        jobs: sql<number>`count(distinct ${schema.jobs.id})`,
        versions: sql<number>`count(distinct ${schema.jobVersions.id})`,
        analyses: sql<number>`count(distinct ${schema.jobAnalyses.id})`,
      })
      .from(schema.jobs)
      .leftJoin(
        schema.jobVersions,
        eq(schema.jobVersions.jobId, schema.jobs.id),
      )
      .leftJoin(
        schema.jobAnalyses,
        eq(schema.jobAnalyses.jobVersionId, schema.jobVersions.id),
      );
    return {
      jobs: Number(row?.jobs ?? 0),
      versions: Number(row?.versions ?? 0),
      analyses: Number(row?.analyses ?? 0),
    };
  }
}
