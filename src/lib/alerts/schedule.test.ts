import { describe, expect, it } from "vitest";
import { nextRunAt, runKey } from "./schedule";

const at = (iso: string) => new Date(iso);

describe("nextRunAt", () => {
  it("runs daily at the local hour", () => {
    // 07:00 in Toronto (EDT, UTC-4) → 08:00 local the same day.
    expect(nextRunAt("daily", 1, 8, "America/Toronto", at("2026-10-20T11:00:00Z"))?.toISOString()).toBe("2026-10-20T12:00:00.000Z");
    // Just after 08:00 local → tomorrow.
    expect(nextRunAt("daily", 1, 8, "America/Toronto", at("2026-10-20T12:00:00Z"))?.toISOString()).toBe("2026-10-21T12:00:00.000Z");
  });

  it("keeps the local hour across the fall clock change", () => {
    // Toronto leaves EDT for EST on 2026-11-01: 08:00 local is 12:00Z before, 13:00Z after.
    expect(nextRunAt("daily", 1, 8, "America/Toronto", at("2026-10-31T13:00:00Z"))?.toISOString()).toBe("2026-11-01T13:00:00.000Z");
  });

  it("runs an hour skipped in spring at the first moment after it", () => {
    // 2026-03-08 02:00 doesn't exist in Toronto; 02:00 resolves to 03:00 EDT (07:00Z).
    expect(nextRunAt("daily", 1, 2, "America/Toronto", at("2026-03-08T05:00:00Z"))?.toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });

  it("runs weekly on the chosen weekday, rolling into next week", () => {
    // 2026-10-20 is a Tuesday. Monday 9:00 Vancouver time.
    const next = nextRunAt("weekly", 1, 9, "America/Vancouver", at("2026-10-20T18:00:00Z"));
    expect(next?.toISOString().slice(0, 10)).toBe("2026-10-26");
    // Already Monday morning, before 9: today.
    expect(nextRunAt("weekly", 1, 9, "America/Vancouver", at("2026-10-26T12:00:00Z"))?.toISOString().slice(0, 10)).toBe("2026-10-26");
  });

  it("is null when alerts are off", () => {
    expect(nextRunAt("off", 1, 8, "UTC", new Date())).toBeNull();
  });
});

describe("runKey", () => {
  it("names a run by its scheduled minute", () => {
    expect(runKey("2026-10-20T12:00:30.000Z", new Date())).toBe("2026-10-20T12:00");
  });
});
