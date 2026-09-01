import { describe, expect, jest, test } from "@jest/globals";
import { RadarConfig } from "../../src/config/config";
import {
  BraveSearchProvider,
  type SearchHttpClient,
} from "../../src/discovery/brave-search.provider";
import {
  PublicAtsJobProvider,
  type AtsHttpClient,
} from "../../src/discovery/public-ats-job.provider";
import {
  DiscoveryService,
  type DiscoveryIngestionRunner,
  type DiscoveryJobFetcher,
  type VacancySearchProvider,
} from "../../src/discovery/discovery.service";
import {
  DiscoveryAutomation,
  type DiscoveryTimer,
} from "../../src/discovery/discovery-automation";
import { formatDiscoveryRunSummary } from "../../src/telegram/discovery-summary";

describe("Brave vacancy discovery", () => {
  test("returns only supported public ATS job URLs without retaining search snippets", async () => {
    const getJson = jest.fn<SearchHttpClient["getJson"]>(async () => ({
      web: {
        results: [
          {
            title: "Senior TypeScript Engineer",
            url: "https://jobs.lever.co/acme/11111111-1111-4111-8111-111111111111",
            description:
              "A Brave-generated search snippet that must not persist",
          },
          {
            title: "Primary School Teacher",
            url: "https://job-boards.greenhouse.io/school/jobs/1234567?gh_src=abc",
            description: "Another transient snippet",
          },
          {
            title: "Staff Frontend Engineer",
            url: "https://jobs.ashbyhq.com/acme/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?utm_source=brave",
            description: "Ashby transient snippet",
          },
          {
            title: "School Operations Manager",
            url: "https://jobs.smartrecruiters.com/international-school/744000123456789-school-operations-manager?trid=abc",
            description: "SmartRecruiters transient snippet",
          },
          {
            title: "Software Engineer",
            url: "https://jobs.smartrecruiters.com/oneclick-ui/company/BoschGroup/publication/f89d2463-04eb-4d3e-b3d8-701242d7038a?dcr_ci=BoschGroup",
            description: "Alternative SmartRecruiters transient snippet",
          },
          {
            title: "Unsupported board",
            url: "https://example.com/jobs/42",
            description: "Not an approved acquisition source",
          },
        ],
      },
    }));
    const provider = new BraveSearchProvider("secret", { getJson });

    const leads = await provider.search("TypeScript jobs in Shanghai");

    expect(leads).toEqual([
      {
        provider: "lever",
        canonicalUrl:
          "https://jobs.lever.co/acme/11111111-1111-4111-8111-111111111111",
        organization: "acme",
        sourceJobId: "11111111-1111-4111-8111-111111111111",
      },
      {
        provider: "greenhouse",
        canonicalUrl: "https://job-boards.greenhouse.io/school/jobs/1234567",
        organization: "school",
        sourceJobId: "1234567",
      },
      {
        provider: "ashby",
        canonicalUrl:
          "https://jobs.ashbyhq.com/acme/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        organization: "acme",
        sourceJobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
      {
        provider: "smartrecruiters",
        canonicalUrl:
          "https://jobs.smartrecruiters.com/international-school/744000123456789-school-operations-manager",
        organization: "international-school",
        sourceJobId: "744000123456789",
      },
      {
        provider: "smartrecruiters",
        canonicalUrl:
          "https://jobs.smartrecruiters.com/oneclick-ui/company/BoschGroup/publication/f89d2463-04eb-4d3e-b3d8-701242d7038a",
        organization: "BoschGroup",
        sourceJobId: "f89d2463-04eb-4d3e-b3d8-701242d7038a",
      },
    ]);
    expect(JSON.stringify(leads)).not.toContain("snippet");
    const requestedUrl = getJson.mock.calls[0]![0];
    expect({
      query: requestedUrl.searchParams.get("q"),
      count: requestedUrl.searchParams.get("count"),
      country: requestedUrl.searchParams.get("country"),
    }).toEqual({
      query: "TypeScript jobs in Shanghai",
      count: "20",
      country: "CN",
    });
  });
});

describe("public ATS vacancy retrieval", () => {
  test("retrieves a discovered Lever posting as a complete job lead", async () => {
    const getJson = jest.fn<AtsHttpClient["getJson"]>(async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      text: "Senior TypeScript Engineer",
      categories: {
        location: "Shanghai, China",
        commitment: "Full-time",
      },
      descriptionPlain: "",
      openingPlain: "Join an international mobility company.",
      descriptionBodyPlain:
        "Build Angular and Node.js products for an international mobility company.",
      lists: [
        {
          text: "Benefits",
          content:
            "The company provides relocation and China work permit sponsorship.",
        },
      ],
      additionalPlain: "",
      hostedUrl:
        "https://jobs.lever.co/acme/11111111-1111-4111-8111-111111111111",
      createdAt: 1_787_000_000_000,
    }));
    const provider = new PublicAtsJobProvider({ getJson });

    const job = await provider.fetch({
      provider: "lever",
      canonicalUrl:
        "https://jobs.lever.co/acme/11111111-1111-4111-8111-111111111111",
      organization: "acme",
      sourceJobId: "11111111-1111-4111-8111-111111111111",
    });

    expect(job).toMatchObject({
      sourceId: "lever",
      mode: "public_http",
      sourceJobId: "11111111-1111-4111-8111-111111111111",
      canonicalUrl:
        "https://jobs.lever.co/acme/11111111-1111-4111-8111-111111111111",
      title: "Senior TypeScript Engineer",
      company: "acme",
      city: "Shanghai, China",
      rawKind: "text",
    });
    expect(job.text).toContain("work permit sponsorship");
  });

  test("retrieves a discovered Greenhouse posting through its public Job Board API", async () => {
    const getJson = jest.fn<AtsHttpClient["getJson"]>(async () => ({
      id: 1234567,
      title: "Russian and English Primary School Teacher",
      company_name: "Shanghai International School",
      first_published: "2026-08-20T10:00:00Z",
      location: { name: "Shanghai, China" },
      content:
        "<p>Teach Russian and English in primary school. Housing, relocation and Work Permit sponsorship are provided.</p>",
      absolute_url: "https://job-boards.greenhouse.io/school/jobs/1234567",
    }));
    const provider = new PublicAtsJobProvider({ getJson });

    const job = await provider.fetch({
      provider: "greenhouse",
      canonicalUrl: "https://job-boards.greenhouse.io/school/jobs/1234567",
      organization: "school",
      sourceJobId: "1234567",
    });

    expect(job).toMatchObject({
      sourceId: "greenhouse",
      mode: "public_http",
      sourceJobId: "1234567",
      canonicalUrl: "https://job-boards.greenhouse.io/school/jobs/1234567",
      title: "Russian and English Primary School Teacher",
      company: "Shanghai International School",
      city: "Shanghai, China",
      rawKind: "html",
    });
    expect(job.text).toContain("Work Permit sponsorship");
  });

  test("retrieves a discovered Ashby posting through its public Job Posting API", async () => {
    const getJson = jest.fn<AtsHttpClient["getJson"]>(async () => ({
      apiVersion: "1",
      jobs: [
        {
          title: "Staff Frontend Engineer",
          location: "Shanghai, China",
          descriptionPlain:
            "Build TypeScript applications. China Work Permit sponsorship is available.",
          descriptionHtml:
            "<p>Build TypeScript applications. China Work Permit sponsorship is available.</p>",
          publishedAt: "2026-08-30T10:00:00Z",
          employmentType: "FullTime",
          workplaceType: "Hybrid",
          address: {
            postalAddress: {
              addressLocality: "Shanghai",
              addressRegion: "Shanghai",
              addressCountry: "China",
            },
          },
          jobUrl:
            "https://jobs.ashbyhq.com/acme/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          applyUrl:
            "https://jobs.ashbyhq.com/acme/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/application",
          isListed: true,
        },
      ],
    }));
    const provider = new PublicAtsJobProvider({ getJson });

    const job = await provider.fetch({
      provider: "ashby",
      canonicalUrl:
        "https://jobs.ashbyhq.com/acme/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organization: "acme",
      sourceJobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(getJson.mock.calls[0]![0].toString()).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/acme",
    );
    expect(job).toMatchObject({
      sourceId: "ashby",
      mode: "public_http",
      sourceJobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      canonicalUrl:
        "https://jobs.ashbyhq.com/acme/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Staff Frontend Engineer",
      company: "acme",
      city: "Shanghai, China",
      rawKind: "text",
    });
    expect(job.text).toContain("Work Permit sponsorship");
  });

  test("retrieves a discovered SmartRecruiters posting through its public Posting API", async () => {
    const getJson = jest.fn<AtsHttpClient["getJson"]>(async () => ({
      id: "744000123456789",
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "School Operations Manager",
      company: {
        identifier: "international-school",
        name: "International School",
      },
      releasedDate: "2026-08-30T10:00:00Z",
      location: {
        city: "Shanghai",
        region: "Shanghai",
        country: "cn",
        remote: false,
      },
      typeOfEmployment: { label: "Full-time" },
      experienceLevel: { label: "Mid-Senior Level" },
      applyUrl:
        "https://jobs.smartrecruiters.com/international-school/744000123456789-school-operations-manager",
      jobAd: {
        sections: {
          companyDescription: { text: "An international school in China." },
          jobDescription: {
            text: "Run school operations and academic support in Shanghai.",
          },
          qualifications: { text: "Professional English is required." },
          additionalInformation: {
            text: "Relocation and Work Permit sponsorship are provided.",
          },
        },
      },
      active: true,
    }));
    const provider = new PublicAtsJobProvider({ getJson });

    const job = await provider.fetch({
      provider: "smartrecruiters",
      canonicalUrl:
        "https://jobs.smartrecruiters.com/international-school/744000123456789-school-operations-manager",
      organization: "international-school",
      sourceJobId: "744000123456789",
    });

    expect(getJson.mock.calls[0]![0].toString()).toBe(
      "https://api.smartrecruiters.com/v1/companies/international-school/postings/744000123456789",
    );
    expect(job).toMatchObject({
      sourceId: "smartrecruiters",
      mode: "public_http",
      sourceJobId: "744000123456789",
      canonicalUrl:
        "https://jobs.smartrecruiters.com/international-school/744000123456789-school-operations-manager",
      title: "School Operations Manager",
      company: "International School",
      city: "Shanghai, China",
      rawKind: "html",
    });
    expect(job.text).toContain("Work Permit sponsorship");
  });
});

describe("two-profile discovery run", () => {
  test("loads separate automatic search plans for both candidate profiles", () => {
    const plans = new RadarConfig().searchPlans;

    expect(
      plans.map(({ id, candidateIds, queries }) => ({
        id,
        candidateIds,
        queryCount: queries.length,
      })),
    ).toEqual([
      { id: "education", candidateIds: ["lanok"], queryCount: 4 },
      { id: "software", candidateIds: ["cnstbmb"], queryCount: 4 },
    ]);
  });

  test("searches both candidate tracks, fetches duplicate links once and ingests one batch", async () => {
    const lead = {
      provider: "lever" as const,
      canonicalUrl:
        "https://jobs.lever.co/acme/11111111-1111-4111-8111-111111111111",
      organization: "acme",
      sourceJobId: "11111111-1111-4111-8111-111111111111",
    };
    const search = {
      search: jest.fn(async () => [lead]),
    } satisfies VacancySearchProvider;
    const fetcher = {
      fetch: jest.fn(async () => ({
        sourceId: "lever",
        mode: "public_http" as const,
        sourceJobId: lead.sourceJobId,
        canonicalUrl: lead.canonicalUrl,
        title: "Senior TypeScript Engineer",
        company: "acme",
        city: "Shanghai",
        text: "Senior TypeScript Engineer in Shanghai with complete requirements.",
        rawKind: "text" as const,
        metadata: {},
      })),
    } satisfies DiscoveryJobFetcher;
    const observed: string[] = [];
    const ingestion = {
      run: jest.fn<DiscoveryIngestionRunner["run"]>(async (adapter) => {
        for await (const job of adapter.collect())
          observed.push(job.canonicalUrl!);
        return [
          {
            runId: "run-1",
            jobId: "job-1",
            versionId: "version-1",
            newVersion: true,
            analyses: 2,
            failedAnalyses: 0,
            notifications: 1,
            failedNotifications: 0,
            rejectedProfiles: [],
          },
        ];
      }),
    } satisfies DiscoveryIngestionRunner;
    const service = new DiscoveryService(search, fetcher, ingestion, [
      {
        id: "software",
        candidateIds: ["cnstbmb"],
        queries: ["software query"],
      },
      {
        id: "education",
        candidateIds: ["lanok"],
        queries: ["education query"],
      },
    ]);

    const summary = await service.run();

    expect(summary).toEqual({
      tracks: ["software", "education"],
      candidateIds: ["cnstbmb", "lanok"],
      queriesAttempted: 2,
      failedQueries: 0,
      discoveredLeads: 2,
      uniqueLeads: 1,
      fetchedJobs: 1,
      failedFetches: 0,
      processedJobs: 1,
      newVersions: 1,
      analyses: 2,
      failedAnalyses: 0,
      notifications: 1,
      failedNotifications: 0,
    });
    expect(observed).toEqual([lead.canonicalUrl]);
  });

  test("continues when one search query and one discovered posting fail", async () => {
    const goodLead = {
      provider: "greenhouse" as const,
      canonicalUrl: "https://job-boards.greenhouse.io/school/jobs/1234567",
      organization: "school",
      sourceJobId: "1234567",
    };
    const brokenLead = {
      provider: "lever" as const,
      canonicalUrl:
        "https://jobs.lever.co/closed/22222222-2222-4222-8222-222222222222",
      organization: "closed",
      sourceJobId: "22222222-2222-4222-8222-222222222222",
    };
    const search = {
      search: jest.fn<VacancySearchProvider["search"]>(async (query) => {
        if (query === "broken query") throw new Error("temporary outage");
        return [brokenLead, goodLead];
      }),
    };
    const fetcher = {
      fetch: jest.fn<DiscoveryJobFetcher["fetch"]>(async (lead) => {
        if (lead === brokenLead) throw new Error("posting is closed");
        return {
          sourceId: "greenhouse",
          mode: "public_http",
          sourceJobId: goodLead.sourceJobId,
          canonicalUrl: goodLead.canonicalUrl,
          title: "Primary School Teacher",
          company: "School",
          city: "Shanghai",
          text: "Primary school Russian teacher role in Shanghai, China.",
          rawKind: "text",
          metadata: {},
        };
      }),
    };
    const ingestion = {
      run: jest.fn<DiscoveryIngestionRunner["run"]>(async () => []),
    };
    const service = new DiscoveryService(search, fetcher, ingestion, [
      {
        id: "software",
        candidateIds: ["cnstbmb"],
        queries: ["broken query"],
      },
      {
        id: "education",
        candidateIds: ["lanok"],
        queries: ["working query"],
      },
    ]);

    const summary = await service.run();

    expect(summary).toMatchObject({
      queriesAttempted: 2,
      failedQueries: 1,
      discoveredLeads: 2,
      uniqueLeads: 2,
      fetchedJobs: 1,
      failedFetches: 1,
    });
  });
});

describe("automatic discovery schedule", () => {
  test("runs the radar every configured interval and exposes the last summary", async () => {
    let scheduledInterval = 0;
    let scheduledTask: (() => Promise<void>) | undefined;
    let cancelled = false;
    const timer: DiscoveryTimer = {
      every(intervalMs, task) {
        scheduledInterval = intervalMs;
        scheduledTask = task;
        return { cancel: () => (cancelled = true) };
      },
    };
    const summary = {
      tracks: ["software", "education"],
      candidateIds: ["cnstbmb", "lanok"],
      queriesAttempted: 4,
      failedQueries: 0,
      discoveredLeads: 7,
      uniqueLeads: 5,
      fetchedJobs: 4,
      failedFetches: 1,
      processedJobs: 4,
      newVersions: 3,
      analyses: 6,
      failedAnalyses: 2,
      notifications: 2,
      failedNotifications: 1,
    };
    const automation = new DiscoveryAutomation(
      {
        enabled: true,
        runOnStartup: false,
        intervalMinutes: 360,
        apiKeyPresent: true,
      },
      { run: async () => summary },
      timer,
    );

    automation.onModuleInit();
    await scheduledTask!();

    expect(scheduledInterval).toBe(21_600_000);
    expect(automation.status()).toMatchObject({
      enabled: true,
      running: false,
      lastTrigger: "schedule",
      lastSummary: summary,
    });
    automation.onApplicationShutdown();
    expect(cancelled).toBe(true);
  });

  test("formats a concise Telegram report for a completed search", () => {
    expect(
      formatDiscoveryRunSummary({
        tracks: ["software", "education"],
        candidateIds: ["cnstbmb", "lanok"],
        queriesAttempted: 4,
        failedQueries: 1,
        discoveredLeads: 8,
        uniqueLeads: 6,
        fetchedJobs: 5,
        failedFetches: 1,
        processedJobs: 5,
        newVersions: 3,
        analyses: 6,
        failedAnalyses: 2,
        notifications: 2,
        failedNotifications: 1,
      }),
    ).toBe(
      "Поиск завершён для cnstbmb и lanok.\nЗапросы: 4 (ошибок: 1)\nНайдено ссылок: 8, уникальных: 6\nЗагружено вакансий: 5 (ошибок: 1)\nНовых/обновлённых: 3, анализов: 6 (ошибок: 2)\nОтправлено в Telegram: 2 (ошибок: 1)",
    );
  });
});
