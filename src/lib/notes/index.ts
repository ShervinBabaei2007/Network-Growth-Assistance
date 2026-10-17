import { phrasesFor } from "@/lib/classify";
import { clean, hasAny } from "@/lib/text/match";

/**
 * Everything a note may mention. Templates and the AI rewrite only ever see
 * these facts, and the checker rejects drafts that mention anything else.
 */
export type NoteFacts = {
  candidateId: string;
  fullName: string;
  /** The candidate's school, as the user named it in their own list (with its other spellings). */
  university: { name: string; aliases: string[] } | null;
  /** The candidate's discipline, as the user named it. */
  discipline: { name: string; aliases: string[] } | null;
  /** The program as the profile shows it, e.g. "Nursing" or "Mechatronics Engineering". */
  programText: string | null;
  /** The user's own private notes about this person (may mention a shared club or project). */
  candidateNotes: string | null;
  me: { school: string | null; program: string | null; interests: string | null };
};

/** First name if the profile name starts with a plain word; otherwise none. */
export function firstName(fullName: string): string | null {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}][\p{L}'-]{0,29}$/u.test(first) ? first : null;
}

/** Whether the user's own school (as they wrote it) is the candidate's school. */
function sameSchool(me: string | null, university: NoteFacts["university"]): boolean {
  return Boolean(me && university && hasAny(clean(me), phrasesFor(university)));
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Templates grouped in tiers, most specific first; a tier is empty if a fact it needs is missing. */
function tiers(f: NoteFacts): string[][] {
  const hi = firstName(f.fullName) ? `Hi ${firstName(f.fullName)},` : "Hi,";
  const school = f.university?.name ?? null;
  const area = f.discipline ? f.discipline.name.toLowerCase() : null;
  const program = f.programText?.trim() || f.discipline?.name || null;
  const { me } = f;

  return [
    sameSchool(me.school, f.university) && me.program && program
      ? [
          `${hi} I'm also at ${school}, in ${me.program}. I'd like to connect and follow your work in ${program}.`,
          `${hi} fellow ${school} person here, in ${me.program}. Would be great to connect with someone in ${program}.`,
        ]
      : [],
    // With interests, say what draws you to their field; used when it fits the limit.
    me.program && me.school && me.interests && area
      ? [
          `${hi} I'm in ${me.program} at ${me.school}, interested in ${me.interests}. I'd like to connect with people in ${area}.`,
          `${hi} my background is ${me.program} at ${me.school} and I'm into ${me.interests}. Would be great to connect with someone in ${area}.`,
        ]
      : [],
    me.program && me.school && area && school
      ? [
          `${hi} I'm in ${me.program} at ${me.school} with a strong interest in ${area}. I'd like to connect and learn from your experience at ${school}.`,
          `${hi} my background is ${me.program} at ${me.school} and I'm keen to meet others in ${area}. Would be great to connect.`,
        ]
      : [],
    me.interests && area && school
      ? [`${hi} I'm interested in ${me.interests} and growing my network in ${area} at ${school}. I'd be glad to connect.`]
      : [],
    area && school
      ? [`${hi} I'm building connections with people in ${area} at ${school} and would be glad to connect and learn from your experience.`]
      : [],
    [`${hi} I'd be glad to connect and follow your work.`],
  ];
}

/** Trims to the limit at a word boundary without leaving a dangling fragment. */
function fit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const sentenceEnd = cut.lastIndexOf(". ");
  if (sentenceEnd > limit * 0.5) return cut.slice(0, sentenceEnd + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "") + ".";
}

/**
 * A deterministic, honest connection note within `limit` characters. Variety comes
 * from the candidate id, so the same person always gets the same suggestion.
 */
export function suggestNote(facts: NoteFacts, limit: number): string {
  const all = tiers(facts);
  for (const tier of all) {
    const fitting = tier.filter((v) => v.length <= limit);
    if (fitting.length > 0) return fitting[hash(facts.candidateId) % fitting.length];
  }
  return fit(all[all.length - 1][0], limit);
}

const BANNED: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(we|you and i) (met|spoke|talked|chatted)\b|\bour (chat|conversation|meeting)\b|\bas (we )?discussed\b|\bgreat (meeting|talking to) you\b|\bremember me\b/i, reason: "implies a past meeting" },
  { pattern: /\b(job|jobs|hiring|hire|position|positions|role opening|opening|offer|referral|refer me|recruit\w*|internship opportunit\w*)\b/i, reason: "mentions jobs or referrals" },
  { pattern: /https?:\/\/|www\.|@\w/i, reason: "contains a link or handle" },
  { pattern: /!{2,}|\b(amazing|incredible|awesome)\b/i, reason: "too promotional" },
];

/**
 * Checks a draft before it is offered. Besides length and banned claims, every
 * capitalized word that doesn't start a sentence must appear in the facts, so a
 * rewrite can't introduce a company, club or person that isn't known.
 */
export function checkNote(draft: string, facts: NoteFacts, limit: number): { ok: true } | { ok: false; reason: string } {
  const text = draft.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > limit) return { ok: false, reason: `longer than ${limit} characters` };
  for (const b of BANNED) if (b.pattern.test(text)) return { ok: false, reason: b.reason };

  const known = [
    facts.fullName,
    facts.programText,
    facts.candidateNotes,
    facts.me.school,
    facts.me.program,
    facts.me.interests,
    facts.university ? [facts.university.name, ...facts.university.aliases].join(" ") : "",
    facts.discipline ? [facts.discipline.name, ...facts.discipline.aliases].join(" ") : "",
    "Hi Hello I I'm I'd I've I'll LinkedIn",
  ]
    .join(" ")
    .toLowerCase();

  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^[^\p{L}]+|[^\p{L}'’]+$/gu, "");
    if (!w || !/^\p{Lu}/u.test(w)) continue;
    const sentenceStart = i === 0 || /[.!?]$/.test(words[i - 1]);
    if (sentenceStart) continue;
    if (!known.includes(w.toLowerCase())) return { ok: false, reason: `mentions “${w}”, which isn't in the known facts` };
  }
  return { ok: true };
}
