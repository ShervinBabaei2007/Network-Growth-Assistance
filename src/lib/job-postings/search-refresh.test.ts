import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobProvider, ProviderResult, SearchQuery } from "./providers/types";

// The cache rows the fake database holds, and what it was asked to write.
let cacheRows: { query_key: string; status: string; result_count: number; fetched_at: string; next_cursor: string | null }[] = [];
const upserts: unknown[] = [];
let failWrites = false;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ in: async () => ({ data: cacheRows }) }),
      upsert: async (rows: unknown) => {
        if (failWrites) throw new Error("write failed");
        upserts.push(rows);
        return { error: null };
      },
    }),
  }),
}));

const { cacheKey, refreshFromProviders } = await import("./search");

const query: SearchQuery = { what: "Developer", country: "CA", where: null, maxDaysOld: 7, page: 1 };
const answer: ProviderResult = { provider: "jobicy", outcome: "ok", jobs: [], total: 0, skipped: 0 };
const searchJobs = vi.fn(async () => answer);
const provider: JobProvider = { name: "jobicy", label: "Jobicy", cacheMinutes: 60, searchJobs, normalizeJob: () => null };
const stored = (minutesAgo: number, over: Partial<(typeof cacheRows)[number]> = {}) => ({
  query_key: cacheKey("jobicy", query),
  status: "ok",
  result_count: 5,
  fetched_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  next_cursor: null,
  ...over,
});

beforeEach(() => {
  cacheRows = [];
  upserts.length = 0;
  failWrites = false;
  searchJobs.mockClear();
});

describe("refreshFromProviders with a background runner", () => {
  it("shows stored results now and refreshes after the response when the cache has expired", async () => {
    cacheRows = [stored(90)];
    const queued: (() => Promise<unknown>)[] = [];
    const notices = await refreshFromProviders([provider], query, { background: (work) => void queued.push(work) });

    expect(notices).toEqual([{ provider: "jobicy", label: "Jobicy", outcome: "cached", count: 5 }]);
    expect(searchJobs).not.toHaveBeenCalled();
    expect(queued).toHaveLength(1);

    await queued[0]();
    expect(searchJobs).toHaveBeenCalledOnce();
    expect(upserts).toHaveLength(1);
  });

  it("still waits when nothing is stored yet, since there is nothing else to show", async () => {
    const queued: (() => Promise<unknown>)[] = [];
    const notices = await refreshFromProviders([provider], query, { background: (work) => void queued.push(work) });
    expect(searchJobs).toHaveBeenCalledOnce();
    expect(queued).toHaveLength(0);
    expect(notices.map((n) => n.outcome)).toEqual(["ok"]);
  });

  it("still waits when the last answer was a failure or had no results", async () => {
    for (const row of [stored(90, { status: "outage", result_count: 0 }), stored(90, { status: "empty", result_count: 0 })]) {
      cacheRows = [row];
      searchJobs.mockClear();
      await refreshFromProviders([provider], query, { background: () => {} });
      expect(searchJobs).toHaveBeenCalledOnce();
    }
  });

  it("does not ask again when the answer is still fresh, with or without a background runner", async () => {
    cacheRows = [stored(10)];
    await refreshFromProviders([provider], query, { background: () => {} });
    await refreshFromProviders([provider], query);
    expect(searchJobs).not.toHaveBeenCalled();
  });

  it("keeps waiting for the refresh when no background runner is given (alerts, tests)", async () => {
    cacheRows = [stored(90)];
    await refreshFromProviders([provider], query);
    expect(searchJobs).toHaveBeenCalledOnce();
  });

  it("records a provider failure in the background instead of throwing", async () => {
    cacheRows = [stored(90)];
    searchJobs.mockRejectedValueOnce(new Error("boom"));
    const queued: (() => Promise<unknown>)[] = [];
    await refreshFromProviders([provider], query, { background: (work) => void queued.push(work) });
    await expect(queued[0]()).resolves.toBeDefined();
    expect(JSON.stringify(upserts)).toContain("outage");
  });

  it("a database error in the background is swallowed (and logged), never thrown out of the runner", async () => {
    cacheRows = [stored(90)];
    failWrites = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const queued: (() => Promise<unknown>)[] = [];
    await refreshFromProviders([provider], query, { background: (work) => void queued.push(work) });
    await expect(queued[0]()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
