import { z } from "zod";
import { firstName } from "@/lib/notes";
import { unknownNumbers } from "@/lib/text/terms";
import { checkGrounded, type BannedPhrase } from "./grounding";
import type { LLMProvider } from "./llm";

/**
 * A message asking someone about a role, and whether they'd refer the user. Drafts only:
 * the app never sends it. It uses only what's known (names, the job, the company, what the
 * user said about themselves), never claims the person works there now (the evidence may
 * be old), and never implies the two have met unless the user recorded contact with them.
 */

export const REFERRAL_LIMIT = 600;

export type ReferralFacts = {
  fullName: string;
  company: string;
  jobTitle: string;
  /** The user has recorded contact with them (a reply, a sent message): they may say "again". */
  priorContact: boolean;
  me: { school: string | null; program: string | null };
};


export function suggestReferralAsk(f: ReferralFacts): string {
  const hi = firstName(f.fullName) ? `Hi ${firstName(f.fullName)}` : "Hi";
  const me = f.me.program && f.me.school ? ` I'm in ${f.me.program} at ${f.me.school}.` : f.me.school ? ` I'm at ${f.me.school}.` : "";
  const opener = f.priorContact ? `${hi}, thanks again for your time before.` : `${hi}, I hope you're well.`;
  return `${opener}${me} I'm applying for the ${f.jobTitle} role at ${f.company} and saw that you've been at ${f.company}. Would you be open to a short chat about the team? If you think I'd be a good fit, I'd be grateful for a referral, but no pressure at all. Thank you either way.`.slice(0, REFERRAL_LIMIT);
}

/** Like the intro rules, except asking about the role and a referral is the point here. */
const REFERRAL_BANNED: BannedPhrase[] = [
  { pattern: /\bmutual (connection|friend|contact)s?\b|\b(2nd|3rd|second|third)[- ]degree\b|\bwe have .* in common\b/i, reason: "claims a mutual connection or degree" },
  { pattern: /\b(you|you're|you are) (currently|now) (at|with|working)\b|\bas an? (current )?employee\b/i, reason: "says they work there now, which isn't known" },
  { pattern: /https?:\/\/|www\.|@\w/i, reason: "contains a link or handle" },
  { pattern: /!{2,}|\b(amazing|incredible|awesome|dream (job|company))\b/i, reason: "too promotional" },
];
const MET: BannedPhrase = {
  pattern: /\b(we|you and i) (met|spoke|talked|chatted|worked)\b|\bour (chat|conversation|meeting)\b|\bas (we )?discussed\b|\bgreat (meeting|talking to) you\b|\bremember me\b|\bthanks again\b/i,
  reason: "implies a past meeting",
};

export function checkReferralDraft(text: string, f: ReferralFacts): { ok: true } | { ok: false; reason: string } {
  const known = [f.fullName, f.company, f.jobTitle, f.me.school, f.me.program];
  const grounded = checkGrounded(text, known, REFERRAL_LIMIT, f.priorContact ? REFERRAL_BANNED : [...REFERRAL_BANNED, MET]);
  if (!grounded.ok) return grounded;
  const numbers = unknownNumbers(text, known.filter(Boolean).join(" "));
  if (numbers.length) return { ok: false, reason: `mentions “${numbers[0]}”, which isn't in what we know` };
  return { ok: true };
}

const SYSTEM = `You polish a short LinkedIn message a job seeker will send themselves, asking someone about a role at their company and whether they'd consider a referral.

Rewrite the draft to sound natural, warm and brief, using only the facts provided. Stay under the character limit.
- Don't say or imply the person works there now; say they've been at the company.
- Don't imply the two have met or spoken unless "prior_contact" is true.
- Don't invent skills, projects, achievements, numbers, people or reasons.
- Keep it polite and low-pressure. No links, hashtags or emojis.`;

export async function rewriteReferralAsk(llm: LLMProvider, f: ReferralFacts, draft: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  if (!llm.enabled) return { ok: false, reason: "AI suggestions aren't configured." };
  const res = await llm.structured({
    tier: "smart",
    system: SYSTEM,
    user: `Character limit: ${REFERRAL_LIMIT}\nFacts (JSON):\n${JSON.stringify({ name: f.fullName, company: f.company, role: f.jobTitle, prior_contact: f.priorContact, my_school: f.me.school, my_program: f.me.program })}\n\nDraft:\n${draft}`,
    schema: z.object({ message: z.string() }),
    maxTokens: 2000,
  });
  if (!res.ok) return res;
  const text = res.data.message.trim().replace(/^["“]|["”]$/g, "");
  const check = checkReferralDraft(text, f);
  if (!check.ok) return { ok: false, reason: `The AI version was discarded because it ${check.reason}. Here's the template.` };
  return { ok: true, text };
}
