import { describe, expect, it } from "vitest";
import { fromSearchParams, resolveFeed, searchOnly, toSearchParams, type FeedSettings } from "./feed-query";
import { rankFeed, selectFeed, type FeedJob, type FeedMatch } from "./feed-service";

const settings: FeedSettings = { job_titles: ["Developer"], job_country: "CA", job_provinces: ["BC", "ON"], job_seniority: "junior", job_exclude_keywords: ["senior"] };
const NOW = Date.parse("2026-10-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

let n = 0;
function job(over: Partial<FeedJob> = {}): FeedJob {
  n++;
  return {
    id: `j${n}`,
    title: `Developer ${n}`,
    company: `Company ${n}`,
    city: "Vancouver",
    province: "BC",
    country: "CA",
    countries: ["CA"],
    remote: false,
    workplace_type: null,
    posted_at: hoursAgo(2),
    date_source: "provider",
    date_note: null,
    source: "ats",
    user_id: null,
    employer_id: null,
    salary: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    employment_type: null,
    experience_level: null,
    level_source: null,
    apply_url: `https://jobs.example.com/${n}`,
    verification_status: "verified",
    verification_note: null,
    closed_at: null,
    description: "Build things",
    dedupe_key: `key${n}`,
    desc_fingerprint: null,
    description_is_partial: false,
    canonical_url: null,
    ...over,
  };
}

const ctx = (params: Record<string, string> = {}, states = new Map<string, "saved" | "applied" | "dismissed">()) => ({
  resolved: resolveFeed(fromSearchParams(params), settings),
  settings,
  states,
  isReal: () => true,
  now: NOW,
});

describe("feed queries", () => {
  it("keep only known keys and join repeated ones", () => {
    expect(fromSearchParams({ q: "React", level: ["junior", "intermediate"], evil: "x" }).params).toEqual({ q: "React", level: "junior,intermediate" });
  });

  it("tell 'my level from Settings' apart from 'any level'", () => {
    expect(resolveFeed(fromSearchParams({}), settings).levelChosen).toBe(false);
    expect(resolveFeed(fromSearchParams({ level: "" }), settings).levelChosen).toBe(true);
    expect(toSearchParams(fromSearchParams({ level: "" })).toString()).toBe("level=");
  });

  it("save the search without the tab or page", () => {
    expect(searchOnly(fromSearchParams({ q: "React", tab: "fit", page: "3" })).params).toEqual({ q: "React" });
  });

  it("fill in the country and titles from Settings, and read a province typed as a place", () => {
    const r = resolveFeed(fromSearchParams({ country: "XX", where: "Ontario" }), settings);
    expect(r.country).toBe("CA");
    expect(r.searched).toEqual(["Developer"]);
    expect(r.whereProvince).toBe("ON");
    expect(r.placeName).toBe("Ontario");
  });
});

describe("selectFeed", () => {
  it("drops dismissed jobs and titles with excluded words", () => {
    const keep = job();
    const dismissed = job();
    const senior = job({ title: "Senior Developer" });
    const s = selectFeed([keep, dismissed, senior], ctx({ level: "" }, new Map([[dismissed.id, "dismissed"]])));
    expect(s.rows.map((j) => j.id)).toEqual([keep.id]);
  });

  it("uses the shortest window with enough verified jobs", () => {
    const today = Array.from({ length: 10 }, () => job({ posted_at: hoursAgo(3) }));
    const older = job({ posted_at: hoursAgo(60) });
    const s = selectFeed([...today, older], ctx({ level: "" }));
    expect(s.range.key).toBe("1d");
    expect(s.rows).toHaveLength(10);
    expect(s.expandedFrom).toBeNull();
  });

  it("widens the window when the newest day has too few", () => {
    const s = selectFeed([job({ posted_at: hoursAgo(3) }), job({ posted_at: hoursAgo(60) })], ctx({ level: "" }));
    expect(s.range.key).toBe("7d");
    expect(s.expandedFrom?.key).toBe("1d");
  });

  it("merges the same job from two sources, keeping the verified board link", () => {
    const board = job({ title: "Data Analyst", company: "Acme", dedupe_key: "acme|data analyst|bc" });
    const copy = job({ title: "Data Analyst", company: "Acme", dedupe_key: "acme|data analyst|bc", source: "jobicy", verification_status: "pending_validation", apply_url: "https://jobicy.example/1" });
    const s = selectFeed([copy, board], { ...ctx({ level: "", unchecked: "1" }) });
    expect(s.rows.map((j) => j.id)).toEqual([board.id]);
    expect(s.duplicatesOf.get(board.id)?.map((j) => j.id)).toEqual([copy.id]);
  });

  it("gives the same answer for the same rows at the same moment", () => {
    const rows = [job({ posted_at: hoursAgo(1) }), job({ posted_at: hoursAgo(30) }), job({ posted_at: hoursAgo(100) })];
    const a = selectFeed(rows, ctx({ level: "" }));
    const b = selectFeed([...rows].reverse(), ctx({ level: "" }));
    expect(new Set(b.rows.map((j) => j.id))).toEqual(new Set(a.rows.map((j) => j.id)));
    // Later, the oldest one falls out of the window.
    const later = selectFeed(rows, { ...ctx({ level: "", range: "3d" }), now: NOW + 48 * 3600_000 });
    expect(later.rows.map((j) => j.id)).toEqual([rows[0].id]);
  });
});

describe("rankFeed", () => {
  it("splits by fit and keeps 'doesn't qualify' out of All results", () => {
    const [strong, stretch, excluded, unchecked] = [job(), job(), job(), job()];
    const matches = new Map<string, FeedMatch>([
      [strong.id, { tier: "strong", score: 90, summary: null, results: null }],
      [stretch.id, { tier: "stretch", score: 40, summary: null, results: null }],
      [excluded.id, { tier: "excluded", score: 10, summary: null, results: null }],
    ]);
    const c = ctx({ level: "" });
    const tabs = rankFeed([unchecked, excluded, stretch, strong], [strong], { ...c, matches, resume: null });
    expect(tabs.all.map((j) => j.id)).not.toContain(excluded.id);
    expect(tabs.all[0].id).toBe(strong.id);
    expect(tabs.fit.map((j) => j.id)).toEqual([strong.id]);
    expect(tabs.stretch.map((j) => j.id)).toEqual([stretch.id]);
    expect(tabs.excluded.map((j) => j.id)).toEqual([excluded.id]);
    expect(tabs.saved.map((j) => j.id)).toEqual([strong.id]);
  });
});
