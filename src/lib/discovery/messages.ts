import { z } from "zod";
import { firstName } from "@/lib/notes";
import { checkGrounded } from "./grounding";
import { INTRO_LIMIT } from "./labels";
import type { LLMProvider } from "./llm";

/**
 * Suggested introduction messages. They use only verified facts about the person
 * and what the user said about themselves. The app never sends them; the user
 * copies one into LinkedIn themselves if they want to.
 */

export { INTRO_LIMIT };

export type IntroFacts = {
  personId: string;
  fullName: string;
  institution: string | null;
  program: string | null;
  role: string | null;
  company: string | null;
  me: { school: string | null; program: string | null; interests: string | null; goal: string | null };
};

// Schools are written as the facts give them; no school is shortened by a built-in list.
const short = (s: string | null) => s;
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

/** A deterministic intro from verified facts, within `limit` characters. */
export function suggestIntro(f: IntroFacts, limit = INTRO_LIMIT): string {
  const hi = firstName(f.fullName) ? `Hi ${firstName(f.fullName)}` : "Hi";
  const background = [short(f.institution), f.program].filter(Boolean).join(" ");
  const work = f.role && f.company ? `${f.role.toLowerCase()} work at ${f.company}` : f.company ? `work at ${f.company}` : f.role ? `work as ${article(f.role)} ${f.role.toLowerCase()}` : null;
  const meParts = f.me.program && f.me.school ? `I'm in ${f.me.program} at ${f.me.school}` : f.me.school ? `I'm at ${f.me.school}` : null;

  const variants = [
    meParts && background && work
      ? `${hi}, ${meParts} and came across your ${background} background and ${work}.${f.me.interests ? ` I'm especially interested in ${f.me.interests}` : " I'd value your perspective"} and would love to connect.`
      : null,
    meParts && (background || work)
      ? `${hi}, ${meParts}. I came across your ${background ? `${background} background` : work} while researching people in the field and would love to connect.`
      : null,
    background || work ? `${hi}, I came across your ${background ? `${background} background` : work} and would love to connect and learn from your experience.` : null,
    `${hi}, I'd love to connect and learn from your experience.`,
  ].filter((v): v is string => Boolean(v));
  return variants.find((v) => v.length <= limit) ?? variants[variants.length - 1].slice(0, limit);
}

const SYSTEM = `You polish a short LinkedIn connection message that someone will send themselves, in whatever field they are in.

Rewrite the draft to sound natural and specific, using only the facts provided. Keep it under the character limit.
- Never imply the two have met, talked, worked together or share connections.
- Don't invent interests, projects, companies, clubs or people.
- No links, hashtags or emojis. At most one exclamation mark.`;

export async function rewriteIntro(llm: LLMProvider, facts: IntroFacts, draft: string, limit = INTRO_LIMIT): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  if (!llm.enabled) return { ok: false, reason: "AI suggestions aren't configured on this server." };
  const res = await llm.structured({
    tier: "smart",
    system: SYSTEM,
    user: `Character limit: ${limit}\nFacts (JSON):\n${JSON.stringify(facts, null, 1)}\n\nDraft:\n${draft}`,
    schema: z.object({ message: z.string() }),
    maxTokens: 2000,
  });
  if (!res.ok) return res;
  const text = res.data.message.trim().replace(/^["“]|["”]$/g, "");
  const known = [facts.fullName, facts.institution, short(facts.institution), facts.program, facts.role, facts.company, facts.me.school, facts.me.program, facts.me.interests, facts.me.goal];
  const check = checkGrounded(text, known, limit);
  if (!check.ok) return { ok: false, reason: `The suggestion was discarded because it ${check.reason}.` };
  return { ok: true, text };
}
