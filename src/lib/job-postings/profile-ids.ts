import type { ResumeEntry, ResumeProfile } from "./types";

/**
 * Keeps entry and bullet ids stable when the user edits their profile, so tailored
 * documents and notes that cite "x1b2" still point at the same line. Only new or
 * colliding items get new ids; empty entries and bullets are dropped.
 */

const SECTIONS = [
  ["experience", "x"],
  ["projects", "p"],
  ["education", "d"],
  ["awards", "a"],
  ["activities", "v"],
] as const;

const numberAfter = (id: string, prefix: string) => {
  const m = id.match(new RegExp(`^${prefix}(\\d+)$`));
  return m ? Number(m[1]) : 0;
};

function stableEntries(entries: ResumeEntry[], prefix: string): ResumeEntry[] {
  const kept = entries
    .map((e) => ({ ...e, organization: e.organization.trim(), bullets: e.bullets.map((b) => ({ ...b, text: b.text.trim() })).filter((b) => b.text) }))
    .filter((e) => e.organization || e.bullets.length);
  let next = Math.max(0, ...kept.map((e) => numberAfter(e.id, prefix)));
  const used = new Set<string>();
  return kept.map((e) => {
    const id = /^[a-z]\d+$/.test(e.id) && e.id.startsWith(prefix) && !used.has(e.id) ? e.id : `${prefix}${++next}`;
    used.add(id);
    const bulletPrefix = `${id}b`;
    let nb = Math.max(0, ...e.bullets.map((b) => numberAfter(b.id, bulletPrefix)));
    const usedB = new Set<string>();
    const bullets = e.bullets.map((b) => {
      const bid = numberAfter(b.id, bulletPrefix) > 0 && !usedB.has(b.id) ? b.id : `${bulletPrefix}${++nb}`;
      usedB.add(bid);
      return { id: bid, text: b.text };
    });
    return { ...e, id, bullets };
  });
}

export function withStableIds(profile: ResumeProfile): ResumeProfile {
  const out = { ...profile };
  for (const [key, prefix] of SECTIONS) out[key] = stableEntries(profile[key], prefix);
  return out;
}
