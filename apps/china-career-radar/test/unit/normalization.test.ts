import { describe, expect, test } from "@jest/globals";
import {
  canonicalizeUrl,
  normalizeJob,
} from "../../src/normalization/normalizer";

describe("normalization", () => {
  test("canonical URL removes tracking, fragments, and pagination while retaining identity", () => {
    expect(
      canonicalizeUrl(
        "https://WWW.CHINAJOB.COM/job/job-detail.php?jobid=abc&p=2&utm_source=x#top",
      ),
    ).toBe("https://www.chinajob.com/job/job-detail.php?jobid=abc");
  });
  test("normalizes salary, transferable software track, and Work Permit evidence", () => {
    const job = normalizeJob({
      sourceId: "manual",
      mode: "manual_text",
      title: "Senior Vue Engineer",
      company: "EV Co",
      city: "Shanghai",
      text: "Full-time frontend TypeScript and Vue role in Shanghai. Salary RMB 30-40K·13薪. Work Permit sponsorship provided.",
      rawKind: "text",
      metadata: {},
    });
    expect(job).toMatchObject({
      salaryMin: 30000,
      salaryMax: 40000,
      salaryCurrency: "CNY",
      primaryTrack: "software_engineering",
      visaStatus: "confirmed",
      country: "China",
    });
  });
  test("an explicit non-China ATS location overrides incidental mentions of China", () => {
    const job = normalizeJob({
      sourceId: "greenhouse",
      mode: "public_http",
      title: "Senior Frontend Engineer",
      company: "Mercury",
      city: "San Francisco, CA, New York, NY, or Remote within Canada or United States",
      text: "Build TypeScript products for customers across China and other global markets.",
      rawKind: "text",
      metadata: {},
    });

    expect(job.country).toBe("Unknown");
  });
});
