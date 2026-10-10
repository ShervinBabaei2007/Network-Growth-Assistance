import { describe, expect, it } from "vitest";
import { addDays, isValidTimeZone, localDate, localDateTimeToInstant, startOfLocalDay, weekStart } from "./dates";

describe("localDate", () => {
  it("uses the user's time zone, not UTC", () => {
    // 05:30 UTC on Oct 10 is still the evening of Oct 9 in Vancouver.
    expect(localDate("2026-10-10T05:30:00Z", "America/Vancouver")).toBe("2026-10-09");
    expect(localDate("2026-10-10T05:30:00Z", "America/Toronto")).toBe("2026-10-10");
  });
});

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-10-09")).toBe("2026-10-05"); // Friday
    expect(weekStart("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday
  });
});

describe("addDays", () => {
  it("crosses month boundaries", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("startOfLocalDay", () => {
  // Toronto still switches clocks; BC moved to permanent UTC-7 in 2026 (tzdata 2026c).
  it("finds local midnight in daylight time", () => {
    expect(startOfLocalDay("2026-10-09", "America/Toronto").toISOString()).toBe(
      "2026-10-09T04:00:00.000Z",
    );
  });

  it("finds local midnight in standard time", () => {
    expect(startOfLocalDay("2026-12-01", "America/Toronto").toISOString()).toBe(
      "2026-12-01T05:00:00.000Z",
    );
  });

  it("handles the day clocks change", () => {
    // DST ends on 2026-11-01 at 02:00 local; that midnight is still in daylight time.
    expect(startOfLocalDay("2026-11-01", "America/Toronto").toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
    expect(startOfLocalDay("2026-11-02", "America/Toronto").toISOString()).toBe(
      "2026-11-02T05:00:00.000Z",
    );
  });

  it("follows the zone's current rules", () => {
    expect(startOfLocalDay("2026-12-01", "America/Vancouver").toISOString()).toBe(
      "2026-12-01T07:00:00.000Z",
    );
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("America/Toronto")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("localDateTimeToInstant", () => {
  it("reads wall-clock time in the zone", () => {
    expect(localDateTimeToInstant("2026-10-02T15:04", "America/Toronto").toISOString()).toBe("2026-10-02T19:04:00.000Z");
  });
});
