import { describe, expect, it } from "vitest";
import { buildAnalytics, type AnalyticsInput } from "./index";

const base = (over: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  now: new Date("2026-10-09T16:00:00Z"), // Friday, Toronto
  timezone: "America/Toronto",
  days: 7,
  weeks: 2,
  invitations: [],
  exportConnections: [],
  snapshots: [],
  ...over,
});

describe("buildAnalytics", () => {
  it("has empty, honest series with no data", () => {
    const a = buildAnalytics(base());
    expect(a.daily).toHaveLength(7);
    expect(a.daily[0].date).toBe("2026-10-03");
    expect(a.daily.at(-1)?.date).toBe("2026-10-09");
    expect(a.hasActivity).toBe(false);
    expect(a.networkHistory).toEqual([]);
    expect(a.acceptance.rate).toBeNull();
  });

  it("buckets sends by sent date and acceptances by acceptance date, in local time", () => {
    const a = buildAnalytics(
      base({
        invitations: [
          // 02:00 UTC on the 9th is still the 8th in Toronto.
          { sentAt: "2026-10-09T02:00:00Z", outcome: "pending", resolvedAt: null },
          { sentAt: "2026-10-05T15:00:00Z", outcome: "accepted", resolvedAt: "2026-10-09T15:00:00Z" },
          { sentAt: "2026-09-28T15:00:00Z", outcome: "declined", resolvedAt: "2026-10-06T15:00:00Z" },
        ],
        exportConnections: [{ connectedAt: "2026-10-07T15:00:00Z" }],
      }),
    );
    const day = (d: string) => a.daily.find((p) => p.date === d);
    expect(day("2026-10-08")).toEqual({ date: "2026-10-08", sent: 1, accepted: 0 });
    expect(day("2026-10-05")?.sent).toBe(1);
    expect(day("2026-10-09")?.accepted).toBe(1);
    expect(day("2026-10-07")?.accepted).toBe(1);
    expect(a.weekly).toEqual([
      { weekOf: "2026-09-28", sent: 1, accepted: 0, declinedOrWithdrawn: 0 },
      { weekOf: "2026-10-05", sent: 2, accepted: 2, declinedOrWithdrawn: 1 },
    ]);
  });

  it("reports an acceptance rate only from resolved invitations, once there are enough", () => {
    const resolved = (outcome: "accepted" | "declined", n: number) =>
      Array.from({ length: n }, () => ({ sentAt: "2026-10-01T15:00:00Z", outcome, resolvedAt: "2026-10-02T15:00:00Z" }));
    const few = buildAnalytics(base({ invitations: [...resolved("accepted", 5), ...resolved("declined", 1)] }));
    expect(few.acceptance).toMatchObject({ rate: null, resolved: 6 });

    const many = buildAnalytics(
      base({
        invitations: [
          ...resolved("accepted", 15),
          ...resolved("declined", 5),
          ...Array.from({ length: 30 }, () => ({ sentAt: "2026-10-08T15:00:00Z", outcome: "pending" as const, resolvedAt: null })),
        ],
      }),
    );
    // 30 pending invitations don't drag the rate down; they're reported separately.
    expect(many.acceptance).toMatchObject({ rate: 0.75, resolved: 20, pending: 30 });
  });

  it("keeps the last recorded network total per day", () => {
    const a = buildAnalytics(
      base({
        snapshots: [
          { recordedAt: "2026-10-01T15:00:00Z", total: 1000 },
          { recordedAt: "2026-10-05T20:00:00Z", total: 1012 },
          { recordedAt: "2026-10-05T14:00:00Z", total: 1010 },
        ],
      }),
    );
    expect(a.networkHistory).toEqual([
      { date: "2026-10-01", total: 1000 },
      { date: "2026-10-05", total: 1012 },
    ]);
  });
});
