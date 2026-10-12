import { describe, expect, it } from "vitest";
import { escapeText, foldLine, icsDate, interviewsToIcs } from "./ics";
import { daysWithoutResponse, suggestNoResponse } from "./no-response";
import { parseSort, sortApplications } from "./sort";
import { describeMove, formatPay, isClosed, OPEN_STAGES, STAGES } from "./stages";

describe("stages", () => {
  it("matches the database enum, in pipeline order", () => {
    expect(STAGES).toEqual(["saved", "applied", "screening", "interviewing", "offer", "accepted", "rejected", "withdrawn", "no_response"]);
  });

  it("knows which stages end an attempt", () => {
    expect(OPEN_STAGES).toEqual(["saved", "applied", "screening", "interviewing", "offer"]);
    expect(isClosed("no_response")).toBe(true);
  });

  it("describes moves, including reopening", () => {
    expect(describeMove(null, "saved")).toBe("Added as Saved");
    expect(describeMove("applied", "screening")).toBe("Applied → Screening");
    expect(describeMove("interviewing", "applied")).toBe("Interviewing → Applied");
    expect(describeMove("rejected", "interviewing")).toBe("Reopened: Rejected → Interviewing");
  });

  it("formats pay only when it's complete, without converting it", () => {
    expect(formatPay(95000, "CAD", "year")).toBe("CAD 95,000 / year");
    expect(formatPay(42.5, "USD", "hour")).toBe("USD 42.5 / hour");
    expect(formatPay(95000, null, "year")).toBeNull();
  });
});

describe("no response suggestions", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const app = (over: Partial<Parameters<typeof daysWithoutResponse>[0]> = {}) => ({
    id: "a",
    stage: "applied" as const,
    stageChangedAt: "2026-10-01T12:00:00Z",
    lastEventAt: null,
    nextInterviewAt: null,
    ...over,
  });

  it("counts days since the last activity", () => {
    expect(daysWithoutResponse(app(), now)).toBe(29);
    expect(daysWithoutResponse(app({ lastEventAt: "2026-10-20T12:00:00Z" }), now)).toBe(10);
  });

  it("only applies to stages where the user is waiting", () => {
    expect(daysWithoutResponse(app({ stage: "saved" }), now)).toBeNull();
    expect(daysWithoutResponse(app({ stage: "offer" }), now)).toBeNull();
    expect(daysWithoutResponse(app({ stage: "screening" }), now)).toBe(29);
  });

  it("doesn't suggest it while an interview is coming up", () => {
    expect(daysWithoutResponse(app({ nextInterviewAt: "2026-11-02T12:00:00Z" }), now)).toBeNull();
    expect(daysWithoutResponse(app({ nextInterviewAt: "2026-10-02T12:00:00Z" }), now)).toBe(29);
  });

  it("suggests only past the threshold, longest wait first", () => {
    const apps = [app({ id: "recent", stageChangedAt: "2026-10-25T12:00:00Z" }), app({ id: "old" }), app({ id: "older", stageChangedAt: "2026-09-01T12:00:00Z" })];
    expect(suggestNoResponse(apps, 21, now).map((a) => [a.id, a.days])).toEqual([
      ["older", 59],
      ["old", 29],
    ]);
  });
});

describe("list sorting", () => {
  const apps = [
    { id: "1", stage: "offer" as const, company: "Beta", title: "Dev", appliedOn: "2026-10-01", stageChangedAt: "2026-10-05T00:00:00Z" },
    { id: "2", stage: "saved" as const, company: null, title: "Analyst", appliedOn: null, stageChangedAt: "2026-10-09T00:00:00Z" },
    { id: "3", stage: "applied" as const, company: "alpha", title: "Engineer", appliedOn: "2026-10-03", stageChangedAt: "2026-10-07T00:00:00Z" },
  ];
  const ids = (key: Parameters<typeof sortApplications>[1], dir: "asc" | "desc") => sortApplications(apps, key, dir).map((a) => a.id);

  it("sorts by most recent change by default", () => {
    expect(parseSort(undefined, undefined)).toEqual({ key: "updated", dir: "desc" });
    expect(ids("updated", "desc")).toEqual(["2", "3", "1"]);
  });

  it("sorts by pipeline order", () => {
    expect(ids("stage", "asc")).toEqual(["2", "3", "1"]);
  });

  it("sorts names case-insensitively and puts missing values last either way", () => {
    expect(ids("company", "asc")).toEqual(["3", "1", "2"]);
    expect(ids("company", "desc")).toEqual(["1", "3", "2"]);
    expect(ids("applied", "desc")).toEqual(["3", "1", "2"]);
    expect(ids("applied", "asc")).toEqual(["1", "3", "2"]);
  });

  it("ignores unknown sort keys", () => {
    expect(parseSort("drop table", "sideways")).toEqual({ key: "updated", dir: "desc" });
    expect(parseSort("company", undefined)).toEqual({ key: "company", dir: "asc" });
  });
});

describe("calendar export", () => {
  const interview = {
    id: "0f8b1c2e-1111-4222-8333-444455556666",
    startsAt: "2026-11-02T18:30:00Z",
    durationMinutes: 45,
    timezone: "America/Toronto",
    kind: "video",
    location: "Video call; link in email",
    notes: "Ask about the team, the stack, and on-call",
    sequence: 2,
    updatedAt: "2026-10-20T10:00:00Z",
  };

  it("writes UTC times, a stable UID and the sequence", () => {
    const ics = interviewsToIcs({ title: "Developer", company: "Acme, Inc." }, [interview], new Date("2026-10-21T00:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
    expect(ics).toContain("UID:0f8b1c2e-1111-4222-8333-444455556666@network-growth-assistant");
    expect(ics).toContain("DTSTART:20261102T183000Z");
    expect(ics).toContain("DTEND:20261102T191500Z");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("SUMMARY:Video interview: Developer at Acme\\, Inc.");
    expect(ics).toContain("LOCATION:Video call\\; link in email");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("uses CRLF line endings throughout", () => {
    const ics = interviewsToIcs({ title: "Dev", company: null }, [interview]);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("escapes text values", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const long = `DESCRIPTION:${"é".repeat(100)}`;
    const folded = foldLine(long);
    const enc = new TextEncoder();
    for (const line of folded.split("\r\n")) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(long);
  });

  it("formats dates without separators or milliseconds", () => {
    expect(icsDate(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });
});
