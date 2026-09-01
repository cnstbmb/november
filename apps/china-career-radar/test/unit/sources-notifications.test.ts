import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "@jest/globals";
import { SocksProxyAgent } from "socks-proxy-agent";
import { RadarConfig } from "../../src/config/config";
import { formatJobCard } from "../../src/notifications/notifiers";
import { telegramFetchConfig } from "../../src/telegram/bot-client";
import { assessManualSubmission } from "../../src/telegram/manual-submission";
import {
  effectiveFeedbackAction,
  presentFeedback,
} from "../../src/telegram/feedback-presentation";
import { formatSourceSummary } from "../../src/telegram/source-summary";
import {
  formatJobsPage,
  jobsPageKeyboard,
  parseJobsPageCallback,
} from "../../src/telegram/jobs-presentation";
import { normalizeJob } from "../../src/normalization/normalizer";
import {
  assertPublicAddress,
  assertSafeUrlShape,
  UnsafeUrlError,
} from "../../src/sources/safe-fetcher";
import {
  ManualUrlAdapter,
  parseChinaJobDetail,
  ParserDriftError,
} from "../../src/sources/adapters";
import type { SafeHttpFetcher } from "../../src/sources/safe-fetcher";

describe("source safety and fixtures", () => {
  const config = new RadarConfig();
  test("ChinaJob fixture parser extracts stable source identity", () => {
    const html = readFileSync(
      resolve(process.cwd(), "test/fixtures/chinajob/senior-frontend.html"),
      "utf8",
    );
    expect(parseChinaJobDetail(html, "fixture").sourceJobId).toBe("J2600001");
  });
  test("parser drift is typed", () =>
    expect(() => parseChinaJobDetail("<html></html>", "fixture")).toThrow(
      ParserDriftError,
    ));
  test("ChinaJob policy forbids manual URL and live fetch", () => {
    expect(
      config.policyForHost("www.chinajob.com", "manual_url"),
    ).toBeUndefined();
    expect(
      config.sourcePolicies.find((p) => p.id === "chinajob")?.live.enabled,
    ).toBe(false);
  });
  test("URL policy rejects foreign hosts and private addresses", () => {
    const policy = config.sourcePolicies.find((p) => p.id === "chinajob")!;
    expect(() =>
      assertSafeUrlShape("https://evil.example/job", policy),
    ).toThrow(UnsafeUrlError);
    expect(() => assertPublicAddress("127.0.0.1")).toThrow(UnsafeUrlError);
    expect(() => assertPublicAddress("169.254.169.254")).toThrow(
      UnsafeUrlError,
    );
  });
  test("approved manual URL adapter turns fetched HTML into raw input", async () => {
    const base = config.sourcePolicies.find((p) => p.id === "chinajob")!;
    const policy = {
      ...base,
      policyStatus: "approved" as const,
      allowedModes: ["manual_url" as const],
      live: {
        enabled: true,
        approvedAt: "2026-08-27",
        approvedBy: "operator",
      },
    };
    const fetcher = {
      fetch: async () => ({
        finalUrl: "https://www.chinajob.com/job/1",
        contentType: "text/html",
        status: 200,
        body: '<html><head><meta property="og:site_name" content="Example Co"></head><body><h1>Frontend Engineer</h1><p>TypeScript role in Shanghai with enough detail.</p></body></html>',
      }),
    } as SafeHttpFetcher;
    const collected = [];
    for await (const item of new ManualUrlAdapter(
      "https://www.chinajob.com/job/1",
      policy,
      fetcher,
    ).collect())
      collected.push(item);
    expect(collected[0]).toMatchObject({
      sourceId: "chinajob",
      mode: "manual_url",
      title: "Frontend Engineer",
      company: "Example Co",
      rawKind: "html",
    });
  });
});

test("Telegram/console card contains required fields", () => {
  const job = normalizeJob({
    sourceId: "manual",
    mode: "manual_text",
    title: "Frontend",
    company: "Co",
    city: "Shanghai",
    text: "Frontend TypeScript role in Shanghai with Work Permit sponsorship.",
    rawKind: "text",
    metadata: {},
  });
  const card = formatJobCard(
    "a",
    "j",
    "cnstbmb",
    job,
    {
      fitScore: 80,
      verdict: "high_match",
      matchedSkills: [],
      missingSkills: [],
      languages: {
        required: [],
        mandarinRequired: false,
        candidateRisk: "low",
      },
      visa: { status: "confirmed", workPermitRisk: "low" },
      legalFlags: [],
      relocation: { status: "unknown" },
      salaryAssessment: "unknown",
      reasons: ["Подходит"],
      risks: [],
      evidence: [],
      familyCity: "Shanghai",
    },
    false,
  );
  expect(card.text).toEqual(expect.stringContaining("cnstbmb"));
  expect(card.text).toEqual(expect.stringContaining("Work Permit"));
  expect(card.text).toEqual(expect.stringContaining("Shanghai"));
  expect(card.text).toEqual(
    expect.stringContaining("Источник: добавлено вручную"),
  );
  expect(card.text).toEqual(expect.stringContaining("ID вакансии: j"));
});

test("Telegram client uses the configured SOCKS proxy", () => {
  const direct = telegramFetchConfig("");
  const proxied = telegramFetchConfig("socks5h://127.0.0.1:1080");

  expect(direct).toBeUndefined();
  expect(proxied).toMatchObject({ compress: true });
  expect(proxied?.agent).toBeInstanceOf(SocksProxyAgent);
});

test("manual Telegram submission rejects a search brief but accepts a vacancy", () => {
  const brief = assessManualSubmission(`
    Priority location: Shanghai. Also consider Beijing and Shenzhen.
    Target salary: 35-45k RMB per month or higher.
    Do not reject vacancies with an undisclosed salary.
    Prioritize automotive and enterprise SaaS companies.
    Exclude junior positions and internships.
  `);
  const vacancy = assessManualSubmission(`
    Senior TypeScript Engineer — Example Mobility, Shanghai.
    Responsibilities include building Angular applications and Node.js APIs.
    Requirements: five years of commercial development experience and English.
    The employer provides China Work Permit sponsorship.
  `);

  expect(brief).toMatchObject({ kind: "search_brief" });
  expect(brief).toHaveProperty(
    "message",
    expect.stringContaining("не запускает поиск"),
  );
  expect(vacancy).toEqual({ kind: "vacancy" });
});

test("Telegram source summary distinguishes live API discovery from disabled direct Chinese boards", () => {
  const summary = formatSourceSummary(new RadarConfig().sourcePolicies);

  expect(summary).toEqual(expect.stringContaining("Автопоиск: включён"));
  expect(summary).toEqual(expect.stringContaining("Brave Search: включён"));
  expect(summary).toEqual(
    expect.stringContaining("Lever/Greenhouse: включены"),
  );
  expect(summary).toEqual(
    expect.stringContaining("Ashby/SmartRecruiters: включены"),
  );
  expect(summary).toEqual(
    expect.stringContaining("Manual input: приём текста включён"),
  );
  expect(summary).toEqual(
    expect.stringContaining("ChinaJob: только тестовые fixtures"),
  );
  expect(summary).toEqual(
    expect.stringContaining("Zhipin/Liepin/51job и другие: live выключен"),
  );
});

test("Telegram feedback visibly marks the selected state and removes closed controls", () => {
  const interested = presentFeedback(
    "Карточка вакансии",
    "interest",
    "cnstbmb",
    "job-1",
  );
  const closed = presentFeedback(interested.text, "closed", "cnstbmb", "job-1");

  expect(interested.text).toEqual(
    expect.stringContaining("Статус: ✅ Интересно"),
  );
  expect(
    interested.replyMarkup?.inline_keyboard.flat().map((button) => button.text),
  ).toContain("✅ Интересно");
  expect(interested.toast).toBe("Сохранено: Интересно");
  expect(closed.text).not.toEqual(expect.stringContaining("Интересно"));
  expect(closed.text).toEqual(expect.stringContaining("Статус: ⛔ Закрыта"));
  expect(closed.replyMarkup).toBeUndefined();
  expect(closed.toast).toBe("Сохранено: Закрыта");
});

test("a globally closed job overrides callbacks from a stale Telegram card", () => {
  expect(effectiveFeedbackAction("interest", "closed")).toBe("closed");
  expect(effectiveFeedbackAction("applied", "active")).toBe("applied");
});

test("Telegram jobs page lists parsed jobs newest first and offers older results", () => {
  const page = {
    items: [
      {
        id: "job-new",
        firstSeenAt: new Date("2026-08-30T09:15:00.000Z"),
        title: "Senior TypeScript Engineer",
        company: "Mobility Lab",
        city: "Shanghai",
        sourceId: "brave-discovery",
        status: "open",
        canonicalUrl: "https://example.com/jobs/new",
        assessments: [
          {
            candidateId: "cnstbmb",
            state: "completed" as const,
            score: 87,
            verdict: "high_match",
          },
          {
            candidateId: "lanok",
            state: "filtered" as const,
            reasons: [
              {
                code: "role_mismatch",
                message: "Позиция не относится к профилю",
              },
            ],
          },
        ],
      },
      {
        id: "job-old",
        firstSeenAt: new Date("2026-08-29T18:00:00.000Z"),
        title: "Primary School Teacher",
        company: "International School",
        city: "Suzhou",
        sourceId: "manual",
        status: "closed",
        canonicalUrl: null,
        assessments: [
          { candidateId: "cnstbmb", state: "pending" as const },
          {
            candidateId: "lanok",
            state: "failed" as const,
            failureCategory: "analysis_error",
          },
        ],
      },
    ],
    page: 0,
    pageSize: 10,
    total: 12,
  };

  expect(formatJobsPage(page)).toBe(
    [
      "Вакансии: 1–2 из 12",
      "",
      "1. 30.08.2026 · Senior TypeScript Engineer — Mobility Lab, Shanghai",
      "Источник: brave-discovery · Статус: открыта",
      "cnstbmb: ✅ AI 87/high_match",
      "lanok: ⛔ до AI — не подходит направление",
      "https://example.com/jobs/new",
      "",
      "2. 29.08.2026 · Primary School Teacher — International School, Suzhou",
      "Источник: добавлено вручную · Статус: закрыта",
      "cnstbmb: ⏳ AI выполняется",
      "lanok: ⚠️ ошибка AI — analysis_error",
      "ID: job-old",
    ].join("\n"),
  );
  expect(jobsPageKeyboard(page)?.inline_keyboard).toEqual([
    [{ text: "Старее →", callback_data: "jobs:1" }],
  ]);
  expect(parseJobsPageCallback("jobs:1")).toBe(1);
  expect(parseJobsPageCallback("jobs:-1")).toBeUndefined();
  expect(parseJobsPageCallback("jobs:1000000")).toBeUndefined();
});
