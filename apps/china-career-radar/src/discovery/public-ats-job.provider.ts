import { request as httpsRequest } from "node:https";
import { z } from "zod";
import { load } from "cheerio";
import { SocksProxyAgent } from "socks-proxy-agent";
import { rawJobInputSchema, type RawJobInput } from "../domain";
import type { DiscoveredJobLead } from "./brave-search.provider";

export interface AtsHttpClient {
  getJson(url: URL): Promise<unknown>;
}

const maxResponseBytesFor = (url: URL) =>
  url.hostname === "api.ashbyhq.com" ? 33_554_432 : 1_048_576;

async function readJsonBody(
  body: AsyncIterable<Uint8Array>,
  advertisedSize: number,
  maxResponseBytes: number,
): Promise<unknown> {
  if (advertisedSize > maxResponseBytes)
    throw new Error("ats_response_too_large");
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  for await (const value of body) {
    receivedBytes += value.byteLength;
    if (receivedBytes > maxResponseBytes)
      throw new Error("ats_response_too_large");
    chunks.push(value);
  }
  return JSON.parse(
    Buffer.concat(chunks, receivedBytes).toString("utf8"),
  ) as unknown;
}

function getJsonViaSocks(url: URL, proxyUrl: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        agent: new SocksProxyAgent(proxyUrl),
        headers: {
          accept: "application/json",
          "user-agent": "china-career-radar/0.1 (+private family research)",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`ats_http_${status}`));
          return;
        }
        void readJsonBody(
          response,
          Number(response.headers["content-length"]),
          maxResponseBytesFor(url),
        ).then(resolve, reject);
      },
    );
    request.setTimeout(15_000, () => request.destroy(new Error("ats_timeout")));
    request.once("error", reject);
    request.end();
  });
}

export function createAtsHttpClient(proxyUrl = ""): AtsHttpClient {
  return {
    async getJson(url) {
      if (proxyUrl && url.hostname === "api.smartrecruiters.com")
        return getJsonViaSocks(url, proxyUrl);
      const maxResponseBytes = maxResponseBytesFor(url);
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "china-career-radar/0.1 (+private family research)",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`ats_http_${response.status}`);
      if (!response.body) throw new Error("ats_response_body_missing");
      return readJsonBody(
        response.body,
        Number(response.headers.get("content-length")),
        maxResponseBytes,
      );
    },
  };
}

const leverJobSchema = z.object({
  id: z.string(),
  text: z.string(),
  categories: z
    .object({
      location: z.string().optional(),
      commitment: z.string().optional(),
    })
    .default({}),
  descriptionPlain: z.string().optional(),
  openingPlain: z.string().optional(),
  descriptionBodyPlain: z.string().optional(),
  salaryDescriptionPlain: z.string().optional(),
  additionalPlain: z.string().optional(),
  lists: z
    .array(z.object({ text: z.string().optional(), content: z.string() }))
    .default([]),
  country: z.string().optional(),
  workplaceType: z.string().optional(),
  hostedUrl: z.url().optional(),
  createdAt: z.number().optional(),
});

const greenhouseJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  company_name: z.string().optional(),
  first_published: z.string().optional(),
  location: z.object({ name: z.string().optional() }).default({}),
  content: z.string(),
  absolute_url: z.url().optional(),
});

const ashbyBoardSchema = z.object({
  apiVersion: z.string(),
  jobs: z.array(
    z.object({
      title: z.string(),
      location: z.string().nullish(),
      descriptionPlain: z.string().nullish(),
      descriptionHtml: z.string().nullish(),
      publishedAt: z.string().nullish(),
      employmentType: z.string().nullish(),
      workplaceType: z.string().nullish(),
      address: z
        .object({
          postalAddress: z
            .object({
              addressLocality: z.string().nullish(),
              addressRegion: z.string().nullish(),
              addressCountry: z.string().nullish(),
            })
            .nullish(),
        })
        .nullish(),
      jobUrl: z.url(),
      applyUrl: z.url().nullish(),
      isListed: z.boolean().nullish(),
    }),
  ),
});

const smartRecruitersPostingSchema = z.object({
  id: z.string(),
  uuid: z.string().optional(),
  name: z.string(),
  company: z.object({
    identifier: z.string(),
    name: z.string(),
  }),
  releasedDate: z.string().optional(),
  location: z
    .object({
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
      fullLocation: z.string().optional(),
      remote: z.boolean().optional(),
    })
    .default({}),
  typeOfEmployment: z.object({ label: z.string().optional() }).optional(),
  experienceLevel: z.object({ label: z.string().optional() }).optional(),
  applyUrl: z.url().optional(),
  jobAd: z.object({
    sections: z.object({
      companyDescription: z.object({ text: z.string() }).optional(),
      jobDescription: z.object({ text: z.string() }).optional(),
      qualifications: z.object({ text: z.string() }).optional(),
      additionalInformation: z.object({ text: z.string() }).optional(),
    }),
  }),
  active: z.boolean().optional(),
});

type AshbyBoard = z.infer<typeof ashbyBoardSchema>;

export class PublicAtsJobProvider {
  private readonly ashbyBoards = new Map<
    string,
    { expiresAt: number; request: Promise<AshbyBoard> }
  >();

  constructor(private readonly http: AtsHttpClient = createAtsHttpClient()) {}

  async fetch(lead: DiscoveredJobLead): Promise<RawJobInput> {
    if (lead.provider === "ashby") return this.fetchAshby(lead);
    if (lead.provider === "smartrecruiters")
      return this.fetchSmartRecruiters(lead);
    if (lead.provider === "greenhouse") {
      const apiUrl = new URL(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(lead.organization)}/jobs/${encodeURIComponent(lead.sourceJobId)}`,
      );
      const job = greenhouseJobSchema.parse(await this.http.getJson(apiUrl));
      if (String(job.id) !== lead.sourceJobId)
        throw new Error("ats_job_identity_mismatch");
      return rawJobInputSchema.parse({
        sourceId: "greenhouse",
        mode: "public_http",
        sourceJobId: String(job.id),
        canonicalUrl: job.absolute_url ?? lead.canonicalUrl,
        title: job.title,
        company: job.company_name ?? lead.organization,
        city: job.location.name,
        publishedAt: job.first_published
          ? new Date(job.first_published)
          : undefined,
        text: job.content,
        rawKind: "html",
        metadata: { ats: "greenhouse", discoveredBy: "brave" },
      });
    }
    if (lead.provider !== "lever")
      throw new Error(`unsupported_ats_provider:${lead.provider}`);
    const apiHost = new URL(lead.canonicalUrl).hostname.endsWith("eu.lever.co")
      ? "api.eu.lever.co"
      : "api.lever.co";
    const apiUrl = new URL(
      `https://${apiHost}/v0/postings/${encodeURIComponent(lead.organization)}/${encodeURIComponent(lead.sourceJobId)}`,
    );
    const job = leverJobSchema.parse(await this.http.getJson(apiUrl));
    if (job.id !== lead.sourceJobId)
      throw new Error("ats_job_identity_mismatch");
    const text = [
      job.text,
      job.categories.location,
      job.country,
      job.categories.commitment,
      job.workplaceType,
      job.openingPlain,
      job.descriptionPlain,
      job.descriptionBodyPlain,
      ...job.lists.flatMap((section) => [
        section.text,
        load(section.content).text(),
      ]),
      job.salaryDescriptionPlain,
      job.additionalPlain,
    ]
      .filter(Boolean)
      .join("\n\n");
    return rawJobInputSchema.parse({
      sourceId: "lever",
      mode: "public_http",
      sourceJobId: job.id,
      canonicalUrl: job.hostedUrl ?? lead.canonicalUrl,
      title: job.text,
      company: lead.organization,
      city: job.categories.location,
      publishedAt: job.createdAt ? new Date(job.createdAt) : undefined,
      text,
      rawKind: "text",
      metadata: { ats: "lever", discoveredBy: "brave" },
    });
  }

  private async fetchAshby(lead: DiscoveredJobLead): Promise<RawJobInput> {
    const board = await this.loadAshbyBoard(lead.organization);
    const job = board.jobs.find(
      (candidate) =>
        new URL(candidate.jobUrl).pathname.split("/").filter(Boolean).at(-1) ===
        lead.sourceJobId,
    );
    if (!job || job.isListed === false)
      throw new Error("ashby_job_identity_mismatch");
    const text = job.descriptionPlain || job.descriptionHtml;
    if (!text) throw new Error("ashby_job_description_missing");
    const postalAddress = job.address?.postalAddress;
    const structuredLocation = [
      postalAddress?.addressLocality,
      postalAddress?.addressRegion,
      postalAddress?.addressCountry,
    ]
      .filter(
        (part, index, parts): part is string =>
          Boolean(part) &&
          parts.findIndex(
            (candidate) => candidate?.toLowerCase() === part?.toLowerCase(),
          ) === index,
      )
      .join(", ");
    return rawJobInputSchema.parse({
      sourceId: "ashby",
      mode: "public_http",
      sourceJobId: lead.sourceJobId,
      canonicalUrl: job.jobUrl,
      title: job.title,
      company: lead.organization,
      city: structuredLocation || job.location || undefined,
      publishedAt: job.publishedAt ?? undefined,
      text,
      rawKind: job.descriptionPlain ? "text" : "html",
      metadata: {
        ats: "ashby",
        discoveredBy: "brave",
        employmentType: job.employmentType,
        workplaceType: job.workplaceType,
        applyUrl: job.applyUrl,
      },
    });
  }

  private loadAshbyBoard(organization: string): Promise<AshbyBoard> {
    const existing = this.ashbyBoards.get(organization);
    if (existing && existing.expiresAt > Date.now()) return existing.request;
    const request = this.http
      .getJson(
        new URL(
          `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(organization)}`,
        ),
      )
      .then((payload) => ashbyBoardSchema.parse(payload));
    this.ashbyBoards.set(organization, {
      expiresAt: Date.now() + 5 * 60_000,
      request,
    });
    void request.catch(() => this.ashbyBoards.delete(organization));
    return request;
  }

  private async fetchSmartRecruiters(
    lead: DiscoveredJobLead,
  ): Promise<RawJobInput> {
    const apiUrl = new URL(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(lead.organization)}/postings/${encodeURIComponent(lead.sourceJobId)}`,
    );
    const job = smartRecruitersPostingSchema.parse(
      await this.http.getJson(apiUrl),
    );
    if (
      (job.id !== lead.sourceJobId && job.uuid !== lead.sourceJobId) ||
      job.company.identifier !== lead.organization
    )
      throw new Error("smartrecruiters_job_identity_mismatch");
    const sections = job.jobAd.sections;
    const text = [
      sections.companyDescription?.text,
      sections.jobDescription?.text,
      sections.qualifications?.text,
      sections.additionalInformation?.text,
    ]
      .filter(Boolean)
      .join("\n\n");
    const country =
      job.location.country?.toLowerCase() === "cn"
        ? "China"
        : job.location.country;
    const city =
      job.location.fullLocation?.replace(/,\s*,/g, ",").trim() ||
      [job.location.city, job.location.region, country]
        .filter(
          (part, index, parts): part is string =>
            Boolean(part) &&
            parts.findIndex(
              (candidate) => candidate?.toLowerCase() === part?.toLowerCase(),
            ) === index,
        )
        .join(", ");
    return rawJobInputSchema.parse({
      sourceId: "smartrecruiters",
      mode: "public_http",
      sourceJobId: job.id,
      canonicalUrl: lead.canonicalUrl,
      title: job.name,
      company: job.company.name,
      city,
      publishedAt: job.releasedDate,
      text,
      rawKind: "html",
      metadata: {
        ats: "smartrecruiters",
        discoveredBy: "brave",
        remote: job.location.remote,
        employmentType: job.typeOfEmployment?.label,
        experienceLevel: job.experienceLevel?.label,
        applyUrl: job.applyUrl,
      },
    });
  }
}
