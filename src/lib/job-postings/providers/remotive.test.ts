import { describe, expect, it, vi } from "vitest";
import { REMOTIVE_API, RemotiveProvider } from "./remotive";

/** A Remotive job as the public API returns it. */
const raw = (over: Record<string, unknown> = {}) => ({
  id: 2086540,
  url: "https://remotive.com/remote-jobs/software-dev/backend-engineer-2086540",
  title: "Backend Engineer",
  company_name: "Northwind Labs",
  company_logo: "https://remotive.com/job/2086540/logo",
  category: "Software Development",
  tags: ["python"],
  job_type: "full_time",
  publication_date: "2026-10-08T21:47:32",
  candidate_required_location: "USA, Canada",
  salary: "$45-$120/Hour",
  description: "<p>Build REST APIs in Python and PostgreSQL for our platform team. You will own services end to end.</p>",
  ...over,
});

const provider = (body: unknown, status = 200) => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
  return { p: new RemotiveProvider(fetchImpl), fetchImpl };
};

describe("RemotiveProvider.normalizeJob", () => {
  const { p } = provider({});

  it("credits Remotive and keeps its link exactly, never an employer link", () => {
    const j = p.normalizeJob(raw())!;
    expect(j).toMatchObject({
      source: "remotive",
      provider_key: "remotive:2086540",
      apply_url: "https://remotive.com/remote-jobs/software-dev/backend-engineer-2086540",
      source_url: "https://remotive.com/remote-jobs/software-dev/backend-engineer-2086540",
      company: "Northwind Labs",
      remote: true,
      workplace_type: "remote",
      location_text: "Remote (USA, Canada)",
      employment_type: "Full-time",
      verification_status: "pending_validation",
    });
    expect(j.apply_url).not.toMatch(/northwind/);
    expect(p.normalizeJob(raw({ url: "https://northwindlabs.com/jobs/2086540" }))).toBeNull();
  });

  it("uses Remotive's own publication date (read as UTC), never a made-up one", () => {
    expect(p.normalizeJob(raw())!.posted_at).toBe("2026-10-08T21:47:32.000Z");
    expect(p.normalizeJob(raw({ publication_date: null }))).toBeNull();
    expect(p.normalizeJob(raw({ publication_date: "soon" }))).toBeNull();
  });

  it("keeps only jobs open to people in Canada", () => {
    expect(p.normalizeJob(raw({ candidate_required_location: "Worldwide" }))).not.toBeNull();
    expect(p.normalizeJob(raw({ candidate_required_location: "Americas, Europe" }))).not.toBeNull();
    expect(p.normalizeJob(raw({ candidate_required_location: "USA" }))).toBeNull();
    expect(p.normalizeJob(raw({ candidate_required_location: "France, Japan" }))).toBeNull();
    expect(p.normalizeJob(raw({ candidate_required_location: null }))).toBeNull();
  });

  it("shows pay as Remotive wrote it and never turns it into numbers", () => {
    expect(p.normalizeJob(raw())).toMatchObject({ salary: "$45-$120/Hour", salary_min: null, salary_max: null, salary_currency: null, salary_period: null });
    expect(p.normalizeJob(raw({ salary: "" }))).toMatchObject({ salary: null });
  });
});

describe("RemotiveProvider.readFeed", () => {
  it("reads the whole public feed in one request, with no key", async () => {
    const { p, fetchImpl } = provider({ "job-count": 2, "total-job-count": 2, jobs: [raw(), raw({ id: 7, candidate_required_location: "USA" })] });
    const r = await p.readFeed(AbortSignal.timeout(1000));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe(REMOTIVE_API);
    expect(r).toMatchObject({ provider: "remotive", outcome: "ok", skipped: 1, complete: true });
    expect(r.jobs).toHaveLength(1);
  });

  it("says when the feed isn't complete, so missing jobs aren't closed", async () => {
    expect(await provider({ "job-count": 1, "total-job-count": 40, jobs: [raw()] }).p.readFeed(AbortSignal.timeout(1000))).toMatchObject({ complete: false });
    expect(await provider({ jobs: [raw()] }).p.readFeed(AbortSignal.timeout(1000))).toMatchObject({ complete: false });
  });

  it.each([
    [429, "rate_limited"],
    [500, "outage"],
  ])("reports HTTP %i as %s", async (status, outcome) => {
    await expect(provider({}, status).p.readFeed(AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome });
  });

  it("reports an unreadable answer as malformed", async () => {
    await expect(provider({ nope: true }).p.readFeed(AbortSignal.timeout(1000))).rejects.toMatchObject({ outcome: "malformed" });
  });
});
