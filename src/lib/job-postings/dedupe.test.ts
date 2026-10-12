import { describe, expect, it } from "vitest";
import { dedupeJobs, hamming, jobDedupeKey, linkRank, normCompany, sameJob, simhash64, type DedupeItem } from "./dedupe";
import { alsoListedOn } from "./source";

const DESC_A = `Harbourview Software is hiring a Full Stack Developer to build our booking platform.
You will build React and TypeScript interfaces, design Node.js REST APIs, write SQL for PostgreSQL,
review code with the team and help run our services on AWS. Requirements: 1+ years of experience.`;
const DESC_B = `Harbourview Software is hiring a Full Stack Developer for our payments team.
You will maintain Java services, integrate card networks, build internal tools in Angular and own
reconciliation jobs with Kafka and Oracle. Requirements: 5+ years of fintech experience.`;

const item = (over: Partial<DedupeItem> & { id: string }): DedupeItem => ({
  source: "ats",
  dedupe_key: jobDedupeKey({ company: "Harbourview Software Inc.", title: "Full Stack Developer", city: "Vancouver", province: "BC", remote: false }),
  desc_fingerprint: simhash64(DESC_A),
  description_is_partial: false,
  canonical_url: null,
  apply_url: "https://boards.greenhouse.io/harbourview/jobs/1",
  posted_at: "2026-10-11T08:00:00Z",
  verification_status: "verified",
  ...over,
});

describe("keys and fingerprints", () => {
  it("normalizes company names and titles", () => {
    expect(normCompany("Harbourview Software Canada Inc.")).toBe("harbourview software");
    expect(jobDedupeKey({ company: "Harbourview Software", title: "Full Stack Developer (Remote)", city: "Vancouver", province: "BC", remote: false })).toBe(
      jobDedupeKey({ company: "Harbourview Software Ltd.", title: "Full Stack Developer - Vancouver", city: "vancouver", province: "BC", remote: false }),
    );
  });

  it("fingerprints similar text close together and different text far apart", () => {
    const a = simhash64(DESC_A)!;
    expect(hamming(a, simhash64(`${DESC_A}\nApply by Friday.`)!)).toBeLessThanOrEqual(10);
    expect(hamming(a, simhash64(DESC_B)!)).toBeGreaterThan(10);
    expect(simhash64("too short")).toBeNull();
  });
});

describe("dedupeJobs", () => {
  it("merges the same job from a board and from Adzuna, keeping the board's link", () => {
    const board = item({ id: "board" });
    const adzuna = item({ id: "adz", source: "adzuna", apply_url: "https://www.adzuna.ca/land/ad/1", description_is_partial: true, desc_fingerprint: simhash64(DESC_A.slice(0, 160)), verification_status: "pending_validation" });
    const merged = dedupeJobs([adzuna, board]);
    expect(merged).toHaveLength(1);
    expect(merged[0].job.id).toBe("board");
    expect(merged[0].duplicates.map((d) => d.id)).toEqual(["adz"]);
  });

  it("keeps apart two jobs with the same title at the same company but different descriptions", () => {
    const merged = dedupeJobs([item({ id: "a" }), item({ id: "b", desc_fingerprint: simhash64(DESC_B), apply_url: "https://boards.greenhouse.io/harbourview/jobs/2" })]);
    expect(merged.map((m) => m.job.id)).toEqual(["a", "b"]);
  });

  it("merges by canonical URL even when the titles were written differently", () => {
    const a = item({ id: "a", canonical_url: "https://harbourview.com/jobs/1" });
    const b = item({ id: "b", source: "manual", dedupe_key: "other|key|", canonical_url: "https://harbourview.com/jobs/1" });
    expect(dedupeJobs([a, b])).toHaveLength(1);
  });

  it("doesn't merge a partial listing with one posted weeks apart", () => {
    const old = item({ id: "old", posted_at: "2026-09-01T08:00:00Z" });
    const partial = item({ id: "new", source: "adzuna", description_is_partial: true });
    expect(sameJob(old, partial)).toBe(false);
  });

  it("merges a Jobicy remote copy of a board job, keeping the board's link and noting Jobicy", () => {
    const board = item({ id: "board" });
    // Jobicy lists it as remote (no city), with the same full description.
    const jobicy = item({
      id: "jcy",
      source: "jobicy",
      dedupe_key: jobDedupeKey({ company: "Harbourview Software", title: "Full Stack Developer", city: null, province: null, remote: true }),
      apply_url: "https://jobicy.com/jobs/91001-full-stack-developer",
      verification_status: "verified",
    });
    const merged = dedupeJobs([jobicy, board]);
    expect(merged).toHaveLength(1);
    expect(merged[0].job.apply_url).toBe("https://boards.greenhouse.io/harbourview/jobs/1");
    expect(merged[0].duplicates.map((d) => d.source)).toEqual(["jobicy"]);
    expect(alsoListedOn(merged[0].duplicates[0].source)).toBe("Jobicy");
  });

  it("keeps apart a Jobicy role and a board role with similar titles but different work", () => {
    const board = item({ id: "board" });
    const jobicy = item({
      id: "jcy",
      source: "jobicy",
      dedupe_key: jobDedupeKey({ company: "Harbourview Software", title: "Full Stack Developer", city: null, province: null, remote: true }),
      desc_fingerprint: simhash64(DESC_B),
      apply_url: "https://jobicy.com/jobs/91003-full-stack-developer",
    });
    expect(dedupeJobs([board, jobicy])).toHaveLength(2);
    // A snippet alone is not enough to merge across different places.
    expect(sameJob(board, { ...jobicy, desc_fingerprint: simhash64(DESC_A), description_is_partial: true })).toBe(false);
  });

  it("ranks links: employer site, ATS, Jobicy, Remotive, then Adzuna", () => {
    const order = [item({ id: "a", source: "adzuna" }), item({ id: "r", source: "remotive" }), item({ id: "j", source: "jobicy" }), item({ id: "ats" }), item({ id: "own", employerHosted: true })];
    expect([...order].sort((x, y) => linkRank(x) - linkRank(y)).map((x) => x.id)).toEqual(["own", "ats", "j", "r", "a"]);
  });

  it("prefers a verified copy over an unchecked one", () => {
    const unchecked = item({ id: "u", verification_status: "pending_validation" });
    const verified = item({ id: "v", source: "adzuna", apply_url: "https://www.adzuna.ca/land/ad/9" });
    expect(dedupeJobs([unchecked, verified])[0].job.id).toBe("v");
  });
});
