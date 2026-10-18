import { describe, expect, it } from "vitest";
import { expandExportGroups, expandInvitationGroups, stampDay } from "./groups";

const base = { discipline: null, university: null, classified: false, preexisting: false };

describe("expanding grouped activity", () => {
  it("makes one entry per row, on the same local day, in any time zone and across clock changes", () => {
    for (const tz of ["America/Vancouver", "America/St_Johns", "Asia/Kolkata", "Pacific/Auckland", "UTC"]) {
      for (const day of ["2026-03-08", "2026-03-09", "2026-11-01", "2026-10-04", "2026-12-31"]) {
        const rows = expandInvitationGroups([{ ...base, sent_on: day, resolved_on: day, outcome: "accepted", n: 3 }], tz);
        expect(rows).toHaveLength(3);
        expect(stampDay(rows[0].sentAt, tz)).toBe(day);
        expect(stampDay(rows[0].resolvedAt!, tz)).toBe(day);
      }
    }
  });

  it("keeps a pending invitation unresolved", () => {
    const [row] = expandInvitationGroups([{ ...base, sent_on: "2026-05-01", resolved_on: null, outcome: "pending", n: 1 }], "UTC");
    expect(row.resolvedAt).toBeNull();
    expect(row.outcome).toBe("pending");
  });

  it("expands export connections the same way", () => {
    const rows = expandExportGroups([{ ...base, connected_on: "2026-03-09", n: 2 }], "America/Vancouver");
    expect(rows).toHaveLength(2);
    expect(stampDay(rows[0].connectedAt, "America/Vancouver")).toBe("2026-03-09");
  });
});
