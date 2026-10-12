/**
 * Guards for AI-written text about a person. The text may only mention names,
 * places, schools and companies that appear in the facts it was given, and may
 * never claim familiarity, mutual connections or degrees of connection.
 */

export type BannedPhrase = { pattern: RegExp; reason: string };

export const BANNED: BannedPhrase[] = [
  { pattern: /\b(we|you and i) (met|spoke|talked|chatted|worked)\b|\bour (chat|conversation|meeting)\b|\bas (we )?discussed\b|\bgreat (meeting|talking to) you\b|\bremember me\b/i, reason: "implies a past meeting" },
  { pattern: /\bmutual (connection|friend|contact)s?\b|\b(2nd|3rd|second|third)[- ]degree\b|\bwe have .* in common\b/i, reason: "claims a mutual connection or degree" },
  { pattern: /\b(refer(ral)?|refer me|hire me|send (me )?a job)\b/i, reason: "asks for a referral or job" },
  { pattern: /https?:\/\/|www\.|@\w/i, reason: "contains a link or handle" },
  { pattern: /!{2,}|\b(amazing|incredible|awesome)\b/i, reason: "too promotional" },
];

// Capitalized words that are fine anywhere (sentence words, common tech terms).
const COMMON = new Set(
  "hi hello hey i i'm i'd i've i'll linkedin thanks thank ask asking would could their they recent recently ai ml swe backend frontend full stack software engineering engineer engineers computer electrical science university college ece ce cs api cloud gpu cpu".split(" "),
);

/** `banned` defaults to the intro rules; other messages (a referral ask) pass their own. */
export function checkGrounded(text: string, known: (string | null | undefined)[], limit: number, banned: BannedPhrase[] = BANNED): { ok: true } | { ok: false; reason: string } {
  const t = text.trim();
  if (!t) return { ok: false, reason: "empty" };
  if (t.length > limit) return { ok: false, reason: `longer than ${limit} characters` };
  for (const b of banned) if (b.pattern.test(t)) return { ok: false, reason: b.reason };
  const knownText = ` ${known.filter(Boolean).join(" ").toLowerCase()} `;
  const words = t.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^[^\p{L}\d]+|[^\p{L}\d'’]+$/gu, "");
    if (!w || !/^\p{Lu}/u.test(w)) continue;
    const sentenceStart = i === 0 || /[.!?:—–-]$/.test(words[i - 1]) || /^["“(]/.test(words[i]);
    const lower = w.toLowerCase().replace(/[’']s$/, "");
    if (sentenceStart || COMMON.has(lower)) continue;
    if (!knownText.includes(lower)) return { ok: false, reason: `mentions “${w}”, which isn't in the evidence` };
  }
  return { ok: true };
}
