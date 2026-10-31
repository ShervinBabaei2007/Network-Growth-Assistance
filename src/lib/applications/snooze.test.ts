import { describe, expect, it } from "vitest";
import { shiftReminder } from "./snooze";

describe("shiftReminder", () => {
  it("moves a reminder by whole days and keeps the local time", () => {
    // 9:00 in Vancouver on 2026-10-20 (PDT, UTC-7) is 16:00Z.
    const moved = shiftReminder("2026-10-20T16:00:00Z", 7, "America/Vancouver");
    expect(moved.toISOString()).toBe("2026-10-27T16:00:00.000Z");
  });
  it("keeps 9:00 local across the autumn clock change instead of drifting an hour", () => {
    // The clocks went back on 2025-11-02. 9:00 PDT (16:00Z) a week before is 9:00 PST (17:00Z) a week later.
    const moved = shiftReminder("2025-10-29T16:00:00Z", 7, "America/Vancouver");
    expect(moved.toISOString()).toBe("2025-11-05T17:00:00.000Z");
  });
  it("uses the person's day, not UTC's, when the two differ", () => {
    // 23:30 in Vancouver is already the next day in UTC.
    const moved = shiftReminder("2026-10-21T06:30:00Z", 1, "America/Vancouver"); // 2026-10-20 23:30 local
    expect(moved.toISOString()).toBe("2026-10-22T06:30:00.000Z");
  });
  it("is the identity for zero days", () => {
    expect(shiftReminder("2026-10-20T16:00:00Z", 0, "America/Vancouver").toISOString()).toBe("2026-10-20T16:00:00.000Z");
  });
});
