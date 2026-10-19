import { BODY_LIMITS, readCappedJson } from "@/lib/net/read-capped";

/**
 * The Research Organization Registry (https://ror.org, free, no key). Used only to learn which school a short name such as
 * "SFU" means, when the AI that normally reads the request is unavailable. Acronyms are shared worldwide ("SFU" is also a
 * university in Austria and one in China), so a school is returned only when exactly one school in the given country has
 * that acronym; anything less certain returns null and the request is searched without a school.
 */

export type ResolvedSchool = { name: string; aliases: string[]; domain: string | null };

type RorName = { value: string; types: string[] };
type RorItem = { names: RorName[]; links?: { type: string; value: string }[] };

const cache = new Map<string, ResolvedSchool | null>();

export async function findSchoolByAcronym(term: string, countryCode = "CA", fetchImpl: typeof fetch = fetch): Promise<ResolvedSchool | null> {
  const key = `${countryCode}:${term.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key)!;
  let found: ResolvedSchool | null = null;
  try {
    const url = new URL("https://api.ror.org/v2/organizations");
    url.searchParams.set("query", term);
    url.searchParams.set("filter", `types:education,locations.geonames_details.country_code:${countryCode}`);
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(6_000), cache: "no-store" });
    if (res.ok) {
      const body = await readCappedJson<{ items?: RorItem[] }>(res, BODY_LIMITS.api);
      const exact = (body.items ?? []).filter((i) => i.names.some((n) => n.types.includes("acronym") && n.value.toLowerCase() === term.toLowerCase()));
      if (exact.length === 1) {
        const names = exact[0].names;
        const name = names.find((n) => n.types.includes("ror_display"))?.value;
        const site = exact[0].links?.find((l) => l.type === "website")?.value;
        if (name) found = { name, aliases: [...new Set(names.filter((n) => n.value !== name && n.types.some((t) => t === "acronym" || t === "alias")).map((n) => n.value))].slice(0, 6), domain: site ? new URL(site).hostname.replace(/^www\./, "") : null };
      }
    }
  } catch {
    // The registry is unreachable or answered badly: nothing is learned, and nothing is cached.
    return null;
  }
  cache.set(key, found);
  return found;
}

const STOP = new Set("find show get list the our some all any people person alumni students computer science engineering business health law arts english canada canadian".split(" "));

/** Short school names in a request: "SFU alumni", "graduated from UBC", "students at BCIT". At most three. */
export function schoolAcronymCandidates(query: string): string[] {
  const out: string[] = [];
  const add = (t: string | undefined) => {
    if (t && /^[A-Za-z]{2,7}$/.test(t) && !STOP.has(t.toLowerCase()) && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  for (const m of query.matchAll(/\b([A-Za-z]{2,7})\s+(?:alumni|alumnus|alumna|alums?|graduates?|grads?|students?|undergrads?)\b/g)) add(m[1]);
  for (const m of query.matchAll(/\b(?:from|at|of|attended|studied at)\s+(?:the\s+)?([A-Z]{2,6})\b/g)) add(m[1]);
  // Any other all-capitals word ("UBC Mechanical Engineering alumni"); the registry decides whether it is a school.
  for (const m of query.matchAll(/\b([A-Z]{2,7})\b/g)) add(m[1]);
  return out.slice(0, 3);
}
