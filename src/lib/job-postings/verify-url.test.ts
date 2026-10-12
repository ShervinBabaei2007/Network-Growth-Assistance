import { describe, expect, it } from "vitest";
import type { Resolver, Transport } from "@/lib/net/safe-fetch";
import { applyState } from "./apply-state";
import { checkUrlLive } from "./verify-job";
import { checkFinalDestination, checkJobLink, checkUrlShape, hostMatchesCompany, registrableDomain, type LinkContext } from "./verify-url";

const gh: LinkContext = { source: "ats", ats: "greenhouse", boardToken: "acme", externalId: "4001", careersUrl: "https://careers.acme.com", company: "Acme" };
const publicDns: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const serve =
  (map: Record<string, { status: number; body?: string; location?: string }>): Transport =>
  async (url) => {
    const hit = map[url.toString()] ?? { status: 404 };
    return { status: hit.status, headers: hit.location ? { location: hit.location } : { "content-type": "text/html" }, body: hit.body ?? "" };
  };

describe("checkUrlShape", () => {
  it.each([
    ["not a url", "failed_validation"],
    ["http://boards.greenhouse.io/acme/jobs/1", "failed_validation"],
    ["https://93.184.216.34/jobs/1", "failed_validation"],
    ["https://localhost/jobs/1", "failed_validation"],
    ["https://example.com/jobs/1", "failed_validation"],
    ["https://jobs.example.org/role", "failed_validation"],
    ["https://acme.com/careers/placeholder", "failed_validation"],
    ["https://bit.ly/abc123", "failed_validation"],
    ["https://acme.com/", "failed_validation"],
    ["https://acme.com/careers", "failed_validation"],
    ["https://ca.indeed.com/jobs?q=developer", "failed_validation"],
    ["https://www.linkedin.com/jobs/search?keywords=developer", "failed_validation"],
    [null, "unavailable"],
  ])("rejects %s", (url, status) => {
    const r = checkUrlShape(url, { allowFixtureHosts: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(status);
  });

  it("accepts job-specific https links, including a careers page with a job id", () => {
    expect(checkUrlShape("https://boards.greenhouse.io/acme/jobs/4001", { allowFixtureHosts: false }).ok).toBe(true);
    expect(checkUrlShape("https://acme.com/careers?gh_jid=4001", { allowFixtureHosts: false }).ok).toBe(true);
  });

  it("strips tracking from the canonical URL", () => {
    const r = checkUrlShape("https://www.Acme.com/jobs/1/?utm_source=x&gh_src=y#apply", { allowFixtureHosts: false });
    expect(r.ok && r.canonical).toBe("https://acme.com/jobs/1");
  });
});

describe("checkJobLink: the link belongs to its source", () => {
  it("accepts the ATS's own posting page for that board or job", () => {
    expect(checkJobLink("https://boards.greenhouse.io/acme/jobs/4001", gh, { allowFixtureHosts: false }).ok).toBe(true);
    expect(checkJobLink("https://job-boards.greenhouse.io/acme/jobs/4001", gh, { allowFixtureHosts: false }).ok).toBe(true);
  });

  it("accepts the employer's own careers site", () => {
    expect(checkJobLink("https://careers.acme.com/jobs/engineer", gh, { allowFixtureHosts: false }).ok).toBe(true);
    expect(checkJobLink("https://www.unrelated.com/apply?gh_jid=4001", gh, { allowFixtureHosts: false }).ok).toBe(true);
  });

  it("rejects another employer's board, another job site, or an unrelated domain", () => {
    expect(checkJobLink("https://boards.greenhouse.io/othercorp/jobs/77", gh, { allowFixtureHosts: false })).toMatchObject({ ok: false, status: "failed_validation" });
    expect(checkJobLink("https://jobs.lever.co/acme/77", gh, { allowFixtureHosts: false })).toMatchObject({ ok: false, status: "failed_validation" });
    expect(checkJobLink("https://totally-unrelated.biz/role/77", gh, { allowFixtureHosts: false })).toMatchObject({ ok: false, status: "failed_validation" });
  });

  it("accepts only Adzuna's own redirect for the same job id", () => {
    expect(checkJobLink("https://www.adzuna.ca/land/ad/5123?se=x", { source: "adzuna", externalId: "5123" }, { allowFixtureHosts: false }).ok).toBe(true);
    expect(checkJobLink("https://www.adzuna.ca/land/ad/999", { source: "adzuna", externalId: "5123" }, { allowFixtureHosts: false }).ok).toBe(false);
    expect(checkJobLink("https://jobs.someboard.com/5123", { source: "adzuna", externalId: "5123" }, { allowFixtureHosts: false }).ok).toBe(false);
  });

  it("accepts only Jobicy's and Remotive's own listing pages for the same job", () => {
    const off = { allowFixtureHosts: false };
    expect(checkJobLink("https://jobicy.com/jobs/154987-senior-full-stack-engineer-6", { source: "jobicy", externalId: "154987" }, off).ok).toBe(true);
    expect(checkJobLink("https://jobicy.com/jobs/1-other", { source: "jobicy", externalId: "154987" }, off).ok).toBe(false);
    // Another job site's link (or the employer's) is never taken as Jobicy's listing.
    expect(checkJobLink("https://remotive.com/remote-jobs/dev/x-154987", { source: "jobicy", externalId: "154987" }, off).ok).toBe(false);
    expect(checkJobLink("https://boards.greenhouse.io/acme/jobs/154987", { source: "jobicy", externalId: "154987" }, off).ok).toBe(false);
    expect(checkJobLink("https://remotive.com/remote-jobs/software-dev/backend-engineer-2086540", { source: "remotive", externalId: "2086540" }, off).ok).toBe(true);
    expect(checkJobLink("https://remotive.io/remote-jobs/software-dev/backend-engineer-2086540", { source: "remotive", externalId: "2086540" }, off).ok).toBe(false);
    // Private addresses and placeholders fail before the source check.
    expect(checkJobLink("https://127.0.0.1/jobs/154987", { source: "jobicy", externalId: "154987" }, off).ok).toBe(false);
  });
});

describe("authenticity of the final destination", () => {
  it("matches company names to domains, including initials", () => {
    expect(hostMatchesCompany("careers.microsoft.com", "Microsoft")).toBe(true);
    expect(hostMatchesCompany("jobs.rbc.com", "Royal Bank of Canada")).toBe(true);
    expect(hostMatchesCompany("free-prizes.xyz", "Microsoft")).toBe(false);
    expect(registrableDomain("careers.acme.co.uk")).toBe("acme.co.uk");
  });

  it("doesn't verify a Microsoft job that lands on an unrelated domain", () => {
    expect(checkFinalDestination("https://free-prizes.xyz/apply/1", "Microsoft", { source: "adzuna", externalId: "1" })).toMatchObject({ ok: false, status: "pending_validation" });
    expect(checkFinalDestination("https://careers.microsoft.com/job/1", "Microsoft", { source: "adzuna", externalId: "1" }).ok).toBe(true);
  });
});

describe("checkUrlLive", () => {
  const url = "https://boards.greenhouse.io/acme/jobs/4001";

  it("verifies a live posting", async () => {
    const r = await checkUrlLive(url, gh, "Acme", { resolve: publicDns, transport: serve({ [url]: { status: 200, body: "<h1>Software Developer</h1>" } }) });
    expect(r).toEqual({ status: "verified", note: null, finalUrl: url });
  });

  it("doesn't verify a page that is about something else", async () => {
    const page = `<title>Welcome</title><p>${"Our story, our values and our offices around the world. ".repeat(8)}</p>`;
    const r = await checkUrlLive(url, gh, "Acme", { resolve: publicDns, transport: serve({ [url]: { status: 200, body: page } }), jobTitle: "Embedded Firmware Engineer" });
    expect(r.status).toBe("pending_validation");
    const ok = await checkUrlLive(url, gh, "Acme", { resolve: publicDns, transport: serve({ [url]: { status: 200, body: `${page}<h1>Embedded Firmware Engineer</h1>` } }), jobTitle: "Embedded Firmware Engineer" });
    expect(ok.status).toBe("verified");
  });

  it("marks a removed posting expired (404 or a closed notice)", async () => {
    expect((await checkUrlLive(url, gh, "Acme", { resolve: publicDns, transport: serve({}) })).status).toBe("expired");
    const closed = await checkUrlLive(url, gh, "Acme", { resolve: publicDns, transport: serve({ [url]: { status: 200, body: "This job is no longer accepting applications." } }) });
    expect(closed.status).toBe("expired");
  });

  it("follows a legitimate redirect to the posting", async () => {
    const final = "https://boards.greenhouse.io/acme/jobs/4001?t=1";
    const r = await checkUrlLive(url, gh, "Acme", { resolve: publicDns, transport: serve({ [url]: { status: 301, location: final }, [final]: { status: 200, body: "ok" } }) });
    expect(r).toMatchObject({ status: "verified", finalUrl: final });
  });

  it("treats a redirect to a generic page as unavailable", async () => {
    const r = await checkUrlLive(url, gh, "Acme", { resolve: publicDns, transport: serve({ [url]: { status: 302, location: "https://boards.greenhouse.io/" }, "https://boards.greenhouse.io/": { status: 200 } }) });
    expect(r.status).toBe("unavailable");
  });

  it("doesn't fail a link just because the site blocks automated checks", async () => {
    for (const status of [403, 405, 429, 503]) {
      const r = await checkUrlLive(url, gh, "Acme", { resolve: publicDns, transport: serve({ [url]: { status } }) });
      expect(r.status).toBe("pending_validation");
    }
  });

  it("fails a link whose host resolves to a private address", async () => {
    const r = await checkUrlLive(url, gh, "Acme", { resolve: async () => [{ address: "10.0.0.1", family: 4 }], transport: serve({ [url]: { status: 200 } }) });
    expect(r.status).toBe("failed_validation");
  });

  it("rejects placeholder links without any request", async () => {
    let called = false;
    const r = await checkUrlLive("https://example.com/jobs/1", { source: "manual" }, null, {
      resolve: publicDns,
      transport: async () => {
        called = true;
        return { status: 200, headers: {}, body: "" };
      },
    });
    expect(r.status).toBe("failed_validation");
    expect(called).toBe(false);
  });
});

describe("applyState: Apply works only for verified listings", () => {
  const base = { apply_url: "https://boards.greenhouse.io/acme/jobs/4001", closed_at: null, verification_note: null };
  it("enables Apply only when verified", () => {
    expect(applyState({ ...base, verification_status: "verified" })).toEqual({ enabled: true, href: base.apply_url, label: "Apply" });
  });

  it.each(["pending_validation", "expired", "unavailable", "failed_validation"])("disables Apply for %s, with a reason and no link", (status) => {
    const s = applyState({ ...base, verification_status: status });
    expect(s.enabled).toBe(false);
    expect("href" in s).toBe(false);
    if (!s.enabled) expect(s.reason.length).toBeGreaterThan(10);
  });

  it("disables Apply for a closed job or one without a link", () => {
    expect(applyState({ ...base, verification_status: "verified", closed_at: new Date().toISOString() })).toMatchObject({ enabled: false, label: "Expired" });
    expect(applyState({ ...base, apply_url: null, verification_status: "pending_validation" })).toMatchObject({ enabled: false, label: "Link unavailable" });
    expect(applyState({ ...base, verification_status: "pending_validation" })).toMatchObject({ enabled: false, label: "Not yet verified" });
  });
});
