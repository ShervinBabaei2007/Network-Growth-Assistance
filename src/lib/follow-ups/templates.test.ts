import { describe, expect, it } from "vitest";
import { checkFollowUpDraft, draftFollowUp, dueState, FOLLOW_UP_KINDS, isDue, type FollowUpFacts } from "./templates";

const FACTS: FollowUpFacts[] = [
  { fullName: "Maya Chen", school: "Northgate University", program: "Computer Science" },
  { fullName: "Maya Chen", school: null, program: "Computer Science" },
  { fullName: "Maya Chen", school: "Northgate University", program: null },
  { fullName: "Maya Chen", school: null, program: null },
  { fullName: "李雷", school: null, program: null },
  { fullName: "Dr. Priya Nair-Okafor", school: "Lakeshore College", program: "Electrical Engineering" },
];

describe("follow-up drafts", () => {
  for (const kind of FOLLOW_UP_KINDS) {
    it(`${kind} passes the checker for every combination of known facts`, () => {
      for (const facts of FACTS) {
        const text = draftFollowUp(kind, facts);
        expect(checkFollowUpDraft(text, facts), text).toEqual({ ok: true });
      }
    });
  }

  it("only mentions the school and field when they are known", () => {
    const none = draftFollowUp("coffee_chat", { fullName: "Maya Chen", school: null, program: null });
    expect(none).not.toMatch(/Northgate|Computer Science| in \w+ after/);
    const both = draftFollowUp("coffee_chat", FACTS[0]);
    expect(both).toContain("Computer Science");
    expect(both).toContain("Northgate University");
  });

  it("greets by first name only when the name starts with a plain word", () => {
    expect(draftFollowUp("thank_you", FACTS[0])).toMatch(/^Hi Maya,/);
    expect(draftFollowUp("thank_you", { fullName: "12345", school: null, program: null })).toMatch(/^Hi,/);
  });

  it("never claims a past conversation", () => {
    for (const kind of FOLLOW_UP_KINDS) expect(draftFollowUp(kind, FACTS[0])).not.toMatch(/thanks again|last time|when we (spoke|met)/i);
  });
});

describe("the checker rejects edits that invent things", () => {
  const f = FACTS[0];
  it("rejects an invented place or employer", () => {
    expect(checkFollowUpDraft("Hi Maya, congrats on joining Shopify!", f).ok).toBe(false);
  });
  it("rejects invented numbers", () => {
    expect(checkFollowUpDraft("Hi Maya, I read your 3 papers on this.", f).ok).toBe(false);
  });
  it("rejects a claimed past meeting, links and referral asks", () => {
    expect(checkFollowUpDraft("Hi Maya, thanks again for your time last time.", f).ok).toBe(false);
    expect(checkFollowUpDraft("Hi Maya, see https://example.org", f).ok).toBe(false);
    expect(checkFollowUpDraft("Hi Maya, could you refer me?", f).ok).toBe(false);
  });
  it("rejects an empty or over-long message", () => {
    expect(checkFollowUpDraft("   ", f).ok).toBe(false);
    expect(checkFollowUpDraft("Hi Maya. " + "a".repeat(500), f).ok).toBe(false);
  });
});

describe("due dates", () => {
  it("classifies against today", () => {
    expect(dueState("2026-10-17", "2026-10-18")).toBe("overdue");
    expect(dueState("2026-10-18", "2026-10-18")).toBe("today");
    expect(dueState("2026-10-22", "2026-10-18")).toBe("soon");
    expect(dueState("2026-11-30", "2026-10-18")).toBe("later");
  });
  it("is due on or before today", () => {
    expect(isDue("2026-10-18", "2026-10-18")).toBe(true);
    expect(isDue("2026-10-19", "2026-10-18")).toBe(false);
  });
});
