import { z } from "zod";

export interface SearchHttpClient {
  getJson(url: URL, headers: Record<string, string>): Promise<unknown>;
}

export interface DiscoveredJobLead {
  provider: "lever" | "greenhouse" | "ashby" | "smartrecruiters";
  canonicalUrl: string;
  organization: string;
  sourceJobId: string;
}

const responseSchema = z.object({
  web: z
    .object({
      results: z.array(
        z.object({
          url: z.url(),
        }),
      ),
    })
    .optional(),
});

const defaultHttpClient: SearchHttpClient = {
  async getJson(url, headers) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`brave_search_http_${response.status}`);
    return response.json();
  },
};

export class BraveSearchProvider {
  constructor(
    private readonly apiKey: string,
    private readonly http: SearchHttpClient = defaultHttpClient,
  ) {}

  async search(query: string): Promise<DiscoveredJobLead[]> {
    if (!this.apiKey) throw new Error("brave_search_api_key_missing");
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "20");
    url.searchParams.set("country", "CN");
    url.searchParams.set("result_filter", "web");
    url.searchParams.set("safesearch", "strict");
    url.searchParams.set("text_decorations", "false");
    const payload = responseSchema.parse(
      await this.http.getJson(url, {
        "X-Subscription-Token": this.apiKey,
      }),
    );
    const unique = new Map<string, DiscoveredJobLead>();
    for (const result of payload.web?.results ?? []) {
      const lead = parseSupportedAtsUrl(result.url);
      if (lead) unique.set(lead.canonicalUrl, lead);
    }
    return [...unique.values()];
  }
}

export function parseSupportedAtsUrl(
  value: string,
): DiscoveredJobLead | undefined {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  const parts = url.pathname.split("/").filter(Boolean);
  const hostname = url.hostname.toLowerCase();
  if (
    (hostname === "jobs.lever.co" || hostname === "jobs.eu.lever.co") &&
    parts.length === 2 &&
    parts[0] &&
    parts[1]
  ) {
    return {
      provider: "lever",
      canonicalUrl: url.toString(),
      organization: parts[0],
      sourceJobId: parts[1],
    };
  }
  if (
    (hostname === "boards.greenhouse.io" ||
      hostname === "job-boards.greenhouse.io") &&
    parts.length >= 3 &&
    parts[0] &&
    parts.at(-2) === "jobs" &&
    parts.at(-1)
  ) {
    return {
      provider: "greenhouse",
      canonicalUrl: url.toString(),
      organization: parts[0],
      sourceJobId: parts.at(-1)!,
    };
  }
  if (
    hostname === "jobs.ashbyhq.com" &&
    parts.length === 2 &&
    parts[0] &&
    parts[1]
  ) {
    return {
      provider: "ashby",
      canonicalUrl: url.toString(),
      organization: parts[0],
      sourceJobId: parts[1],
    };
  }
  if (
    hostname === "jobs.smartrecruiters.com" &&
    parts.length === 2 &&
    parts[0] &&
    parts[1]
  ) {
    const postingId = parts[1].match(/^(\d+)(?:-|$)/)?.[1];
    if (!postingId) return undefined;
    return {
      provider: "smartrecruiters",
      canonicalUrl: url.toString(),
      organization: parts[0],
      sourceJobId: postingId,
    };
  }
  if (
    hostname === "jobs.smartrecruiters.com" &&
    parts.length === 5 &&
    parts[0] === "oneclick-ui" &&
    parts[1] === "company" &&
    parts[2] &&
    parts[3] === "publication" &&
    parts[4]
  ) {
    return {
      provider: "smartrecruiters",
      canonicalUrl: url.toString(),
      organization: parts[2],
      sourceJobId: parts[4],
    };
  }
  return undefined;
}
