import { describe, expect, it } from "vitest";
import { checkReferralDraft, suggestReferralAsk, type ReferralFacts } from "./referral";

const f: ReferralFacts = { fullName: "Riley Chen", company: "Northwind Labs", jobTitle: "Junior Software Developer", priorContact: false, me: { school: "BCIT", program: "Computer Systems" } };

describe("referral ask", () => {
  it("is grounded in what's known and passes its own check", () => {
    const text = suggestReferralAsk(f);
    expect(text).toContain("Hi Riley");
    expect(text).toContain("Junior Software Developer role at Northwind Labs");
    expect(text).toContain("you've been at Northwind Labs");
    expect(text).not.toMatch(/work there now|currently at/);
    expect(checkReferralDraft(text, f)).toEqual({ ok: true });
  });

  it("only says 'thanks again' after recorded contact", () => {
    expect(suggestReferralAsk(f)).not.toContain("thanks again");
    expect(suggestReferralAsk({ ...f, priorContact: true })).toContain("thanks again");
    expect(checkReferralDraft("Hi Riley, thanks again for your time.", f).ok).toBe(false);
    expect(checkReferralDraft("Hi Riley, thanks again for your time.", { ...f, priorContact: true }).ok).toBe(true);
  });

  it("rejects invented companies, numbers, links and claims about their current job", () => {
    expect(checkReferralDraft("Hi Riley, I loved my time at Contoso.", f)).toMatchObject({ ok: false });
    expect(checkReferralDraft("Hi Riley, I've shipped 12 apps.", f)).toMatchObject({ ok: false });
    expect(checkReferralDraft("Hi Riley, see https://example.com", f)).toMatchObject({ ok: false });
    expect(checkReferralDraft("Hi Riley, since you're currently at Northwind Labs, could you refer me?", f)).toMatchObject({ ok: false });
  });
});
