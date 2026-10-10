import { describe, expect, it } from "vitest";
import { checkNote, firstName, suggestNote, type NoteFacts } from "./index";

const facts = (over: Partial<NoteFacts> = {}): NoteFacts => ({
  candidateId: "c-1",
  fullName: "Ada Lovelace",
  university: "ubc",
  discipline: "ce",
  programText: "Computer Engineering",
  candidateNotes: null,
  me: { school: "BCIT", program: "Computer Systems Technology", interests: "embedded systems" },
  ...over,
});

describe("firstName", () => {
  it("uses a plain first word only", () => {
    expect(firstName("Ada Lovelace")).toBe("Ada");
    expect(firstName("René Tremblay")).toBe("René");
    expect(firstName("🚀 Rocket Person")).toBeNull();
    expect(firstName("Dr.")).toBeNull();
  });
});

describe("suggestNote", () => {
  it("states only the facts it has and stays within the limit", () => {
    const n = suggestNote(facts(), 200);
    expect(n.length).toBeLessThanOrEqual(200);
    expect(n).toMatch(/^Hi Ada,/);
    expect(n).toMatch(/BCIT/);
    expect(checkNote(n, facts(), 200)).toEqual({ ok: true });
  });

  it("mentions a shared school only when it's really shared", () => {
    const shared = suggestNote(facts({ me: { school: "University of British Columbia", program: "Electrical Engineering", interests: null } }), 200);
    expect(shared).toMatch(/also at UBC|fellow UBC student/);
    expect(suggestNote(facts(), 200)).not.toContain("also at");
  });

  it("falls back gracefully without a profile or a category", () => {
    const n = suggestNote(facts({ me: { school: null, program: null, interests: null }, university: null, discipline: null, fullName: "🚀 X" }), 200);
    expect(n).toBe("Hi, I'd be glad to connect and follow your work.");
  });

  it("mentions your interests when they fit, and falls back when they don't", () => {
    const withInterests = facts({ me: { school: "BCIT", program: "Computer Systems Technology", interests: "embedded systems and cloud infrastructure" } });
    const n = suggestNote(withInterests, 200);
    expect(n).toContain("embedded systems and cloud infrastructure");
    expect(n.length).toBeLessThanOrEqual(200);
    expect(checkNote(n, withInterests, 200)).toEqual({ ok: true });
    // Too long to include interests: the program/school wording is used instead.
    const tight = suggestNote(withInterests, 140);
    expect(tight).not.toContain("embedded");
    expect(tight.length).toBeLessThanOrEqual(140);
  });

  it("is deterministic per candidate", () => {
    expect(suggestNote(facts(), 200)).toBe(suggestNote(facts(), 200));
  });

  it("fits very small limits", () => {
    const n = suggestNote(facts(), 60);
    expect(n.length).toBeLessThanOrEqual(60);
    expect(n.endsWith(".")).toBe(true);
  });

  it("never mentions jobs, meetings or links in any template", () => {
    for (const id of ["a", "b", "c", "d", "e"]) {
      for (const limit of [120, 200, 300]) {
        const f = facts({ candidateId: id });
        expect(checkNote(suggestNote(f, limit), f, limit)).toEqual({ ok: true });
      }
    }
  });
});

describe("checkNote", () => {
  const f = facts({ candidateNotes: "Both in the UBC Rocket team" });
  it.each([
    ["Hi Ada, great meeting you at the career fair!", "past meeting"],
    ["Hi Ada, are you hiring for any positions?", "jobs"],
    ["Hi Ada, could you refer me to your team?", "jobs"],
    ["Hi Ada, see https://example.com", "link"],
    ["Hi Ada, I loved your work at Google on Android.", "Google"],
  ])("rejects %s", (draft, reason) => {
    const r = checkNote(draft, f, 200);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(reason);
  });

  it("allows names and organisations from the facts", () => {
    expect(checkNote("Hi Ada, I saw you're on the UBC Rocket team too. I'd like to connect.", f, 200)).toEqual({ ok: true });
  });

  it("enforces the length limit", () => {
    expect(checkNote("Hi Ada, ".repeat(40), f, 200)).toMatchObject({ ok: false });
  });
});
