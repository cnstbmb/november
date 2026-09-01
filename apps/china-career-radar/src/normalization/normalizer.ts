import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { CandidateTrack, NormalizedJob, RawJobInput } from "../domain";

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
export const normalizeText = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim();

export function canonicalizeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$|p$)/i.test(key)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  )
    url.port = "";
  return url.toString();
}

const includesAny = (text: string, terms: string[]) =>
  terms.some((term) => text.includes(term.toLowerCase()));

function tracksFor(text: string): CandidateTrack[] {
  const tracks: CandidateTrack[] = [];
  if (
    includesAny(text, [
      "angular",
      "typescript",
      "javascript",
      "node.js",
      "nestjs",
      "frontend",
      "fullstack",
      "前端",
      "全栈",
      "软件",
    ])
  )
    tracks.push("software_engineering");
  if (includesAny(text, ["russian teacher", "俄语教师", "俄语外教", "русск"]))
    tracks.push("russian_education");
  if (
    includesAny(text, [
      "primary school",
      "elementary school",
      "начальн",
      "小学",
    ])
  )
    tracks.push("primary_education");
  if (includesAny(text, ["english teacher", "esl", "英语教师"]))
    tracks.push("english_teaching_watch");
  if (
    includesAny(text, [
      "secretary",
      "assistant",
      "office manager",
      "coordinator",
      "administrator",
      "секретар",
      "помощник",
      "协调员",
      "助理",
    ])
  )
    tracks.push("administrative_support");
  return tracks.length ? [...new Set(tracks)] : ["other"];
}

export function normalizeJob(input: RawJobInput): NormalizedJob {
  const plain = input.rawKind === "html" ? load(input.text).text() : input.text;
  const description = normalizeText(plain);
  const lower = description.toLowerCase();
  const salary = description.match(
    /(?:cny|rmb|¥|￥)?\s*(\d{1,3})\s*[-–~] ?\s*(\d{1,3})\s*k(?:\s*[·x×]\s*(\d{1,2})\s*薪)?/i,
  );
  const tracks = tracksFor(lower);
  const title = normalizeText(
    input.title ??
      description.split(/[.!?。\n]/)[0]?.slice(0, 300) ??
      "Unknown",
  );
  const company = normalizeText(input.company ?? "Unknown");
  const city = normalizeText(
    input.city ??
      description.match(
        /\b(Shanghai|Shenzhen|Beijing|Guangzhou|Hangzhou|Suzhou|Chengdu|Nanjing|Wuhan|Xi'an|Xiamen|Tianjin|Chongqing|Qingdao)\b/i,
      )?.[1] ??
      "Unknown",
  );
  const explicitCity = input.city?.trim();
  const locationEvidence =
    explicitCity && explicitCity.toLowerCase() !== "unknown"
      ? explicitCity
      : `${city} ${description}`;
  const china =
    /china|中国|shanghai|shenzhen|beijing|guangzhou|hangzhou|suzhou|chengdu|nanjing|wuhan|xi'an|xiamen|tianjin|chongqing|qingdao/i.test(
      locationEvidence,
    );
  const visaStatus =
    /work\s*permit|work\s*visa|visa sponsorship|工作签证|工作许可/i.test(
      description,
    )
      ? "confirmed"
      : /no\s+(?:visa|sponsorship)|must already have.*work authorization|不提供.*签证/i.test(
            description,
          )
        ? "unsupported"
        : "unknown";
  const canonicalUrl = canonicalizeUrl(input.canonicalUrl);
  const workMode = /hybrid/i.test(description)
    ? "hybrid"
    : /remote|远程/i.test(description)
      ? "remote"
      : /on.?site|现场|office/i.test(description)
        ? "onsite"
        : "unknown";
  const employmentType = /\bintern(?:ship)?\b|实习/i.test(description)
    ? "internship"
    : /part.?time|兼职/i.test(description)
      ? "part_time"
      : /contract/i.test(description)
        ? "contract"
        : /full.?time|全职/i.test(description)
          ? "full_time"
          : "unknown";
  const material = {
    title,
    company,
    city,
    country: china ? "China" : "Unknown",
    description,
    canonicalUrl,
    salary: salary?.[0],
    tracks,
    visaStatus,
    workMode,
    employmentType,
  };
  return {
    sourceId: input.sourceId,
    sourceJobId: input.sourceJobId,
    canonicalUrl,
    title,
    company,
    city,
    country: material.country,
    workMode,
    employmentType,
    salaryMin: salary ? Number(salary[1]) * 1000 : undefined,
    salaryMax: salary ? Number(salary[2]) * 1000 : undefined,
    salaryCurrency: salary ? "CNY" : undefined,
    salaryPeriod: salary ? "month" : undefined,
    salaryRaw: salary?.[0],
    publishedAt: input.publishedAt,
    description,
    normalizedDescription: description.toLowerCase(),
    contentHash: sha256(JSON.stringify(material)),
    languages: ["Russian", "English", "Mandarin"].filter(
      (language) =>
        lower.includes(language.toLowerCase()) ||
        (language === "Mandarin" && /chinese|中文|普通话/i.test(description)),
    ),
    visaStatus,
    relocation: /relocation|relocation package|搬迁/i.test(description)
      ? "confirmed"
      : "unknown",
    housing: /housing|accommodation|住房|住宿/i.test(description)
      ? "confirmed"
      : "unknown",
    primaryTrack: tracks[0]!,
    candidateTracks: tracks,
  };
}
