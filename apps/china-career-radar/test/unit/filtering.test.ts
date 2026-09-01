import { describe, expect, test } from "vitest";
import { hardFilter } from "../../src/filtering/hard-filter";
import { normalizeJob } from "../../src/normalization/normalizer";
import type { CandidateProfile } from "../../src/domain";

const profile = (id: string): CandidateProfile => ({
  id,
  displayName: id,
  contentHash: "x",
  definition: { internshipsAllowed: false },
  analyzerProjection: {
    skills: [],
    languages: {},
    roleFamilies: [],
    salaryFloorCnyMonthlyGross: 20000,
  },
});

describe("hard filters", () => {
  test("rejects explicit PRC-only and mandatory Mandarin software jobs", () => {
    const job = normalizeJob({
      sourceId: "manual",
      mode: "manual_text",
      title: "Frontend Engineer",
      company: "Co",
      city: "Shanghai",
      text: "Frontend TypeScript role in Shanghai. Chinese citizens only. Native Mandarin required.",
      rawKind: "text",
      metadata: {},
    });
    expect(
      hardFilter(job, profile("cnstbmb")).reasons.map((reason) => reason.code),
    ).toEqual(
      expect.arrayContaining(["citizenship_conflict", "mandarin_required"]),
    );
  });
  test("keeps ESL as relevant but rejects native-passport conflict", () => {
    const job = normalizeJob({
      sourceId: "manual",
      mode: "manual_text",
      title: "English Teacher",
      company: "School",
      city: "Shanghai",
      text: "English teacher ESL in Shanghai. Native English speaker with US, UK, Canada, Australia or New Zealand passport required.",
      rawKind: "text",
      metadata: {},
    });
    expect(
      hardFilter(job, profile("lanok")).reasons.map((reason) => reason.code),
    ).toContain("native_passport_conflict");
  });
});
