import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "cheerio";
import type { SourcePolicy } from "../config/config";
import type { RawJobInput } from "../domain";
import { rawJobInputSchema } from "../domain";
import type { SafeHttpFetcher } from "./safe-fetcher";

export interface SourceAdapter {
  readonly sourceId: string;
  readonly mode: RawJobInput["mode"];
  collect(): AsyncIterable<RawJobInput>;
}

export class ManualTextAdapter implements SourceAdapter {
  readonly sourceId = "manual";
  readonly mode = "manual_text" as const;
  constructor(private readonly input: Omit<RawJobInput, "sourceId" | "mode">) {}
  async *collect(): AsyncIterable<RawJobInput> {
    yield rawJobInputSchema.parse({
      ...this.input,
      sourceId: this.sourceId,
      mode: this.mode,
    });
  }
}

export class ManualUrlAdapter implements SourceAdapter {
  readonly sourceId: string;
  readonly mode = "manual_url" as const;

  constructor(
    private readonly url: string,
    private readonly policy: SourcePolicy,
    private readonly fetcher: SafeHttpFetcher,
  ) {
    this.sourceId = policy.id;
  }

  async *collect(): AsyncIterable<RawJobInput> {
    const document = await this.fetcher.fetch(this.url, this.policy);
    const rawKind =
      document.contentType === "text/html"
        ? "html"
        : document.contentType.includes("json")
          ? "json"
          : "text";
    let title: string | undefined;
    let company: string | undefined;

    if (rawKind === "html") {
      const $ = load(document.body);
      title =
        $('meta[property="og:title"]').attr("content")?.trim() ||
        $("h1").first().text().trim() ||
        $("title").text().trim() ||
        undefined;
      company =
        $('meta[property="og:site_name"]').attr("content")?.trim() || undefined;
    }

    yield rawJobInputSchema.parse({
      sourceId: this.sourceId,
      mode: this.mode,
      canonicalUrl: document.finalUrl,
      title,
      company,
      text: document.body,
      rawKind,
      metadata: {
        contentType: document.contentType,
        httpStatus: document.status,
      },
    });
  }
}

export class ChinaJobFixtureAdapter implements SourceAdapter {
  readonly sourceId = "chinajob";
  readonly mode = "fixture" as const;
  constructor(private readonly fixtureName = "senior-frontend.html") {}
  async *collect(): AsyncIterable<RawJobInput> {
    const path = resolve(
      process.cwd(),
      "test/fixtures/chinajob",
      this.fixtureName,
    );
    const html = await readFile(path, "utf8");
    yield parseChinaJobDetail(html, `fixture://${this.fixtureName}`);
  }
}

export class ParserDriftError extends Error {}

export function parseChinaJobDetail(
  html: string,
  fixtureLocator: string,
): RawJobInput {
  const $ = load(html);
  const title = $("h1.cj-job-title").first().text().trim();
  const company = $(".job-company, .job-post").first().text().trim();
  const description = $(".cj-job-desc-content").first().text().trim();
  const reference =
    title.match(/\((J\d+)\)/)?.[1] ??
    $("[data-job-reference]").attr("data-job-reference");
  if (!title || !company || !description || !reference)
    throw new ParserDriftError("chinajob_required_selector_missing");
  const city =
    $('.job-location, [data-field="city"]').first().text().trim() || undefined;
  const jobid = $("body").attr("data-jobid");
  return rawJobInputSchema.parse({
    sourceId: "chinajob",
    mode: "fixture",
    sourceJobId: reference,
    canonicalUrl: jobid
      ? `https://www.chinajob.com/job/job-detail.php?jobid=${encodeURIComponent(jobid)}`
      : undefined,
    title: title.replace(/\s*\(J\d+\)\s*$/, ""),
    company,
    city,
    text: html,
    rawKind: "html",
    metadata: { fixtureLocator, opaqueJobId: jobid },
  });
}
