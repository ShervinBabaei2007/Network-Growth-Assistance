import "server-only";
import { COMPANY_ALIASES } from "@/lib/discovery/criteria";
import type { Db } from "@/lib/job-postings/service";
import { companyKey, counts, matchCompany, type AliasDecision, type CompanyMatch } from "./match";

/**
 * People the user knows at a company: imported LinkedIn connections and saved People.
 * Each comes with why they matched and how old the evidence is. Old evidence is said to be
 * old: someone listed at a company months ago may have moved on, so nobody is presented
 * as a confirmed current employee.
 */

export const STALE_AFTER_DAYS = 180;

export type PersonAtCompany = {
  key: string;
  kind: "connection" | "person";
  /** network_people id, for People links and referrals; null for an imported connection. */
  personId: string | null;
  name: string;
  title: string | null;
  company: string;
  linkedinUrl: string | null;
  match: CompanyMatch;
  evidence: { label: string; at: string | null; stale: boolean };
};

const daysSince = (iso: string, now: number) => Math.floor((now - Date.parse(iso)) / 86_400_000);

/** "imported 3 months ago", "from a source read 2 days ago". */
export function evidenceAge(iso: string | null, now: number): { ago: string; stale: boolean } {
  if (!iso) return { ago: "date unknown", stale: true };
  const d = daysSince(iso, now);
  const ago = d < 1 ? "today" : d < 2 ? "yesterday" : d < 60 ? `${d} days ago` : d < 730 ? `${Math.round(d / 30)} months ago` : `${Math.round(d / 365)} years ago`;
  return { ago, stale: d > STALE_AFTER_DAYS };
}

/** Words to look for in stored company names before matching them properly. */
function searchTerms(company: string): string[] {
  const key = companyKey(company);
  const first = key.split(" ")[0] ?? "";
  const terms = new Set<string>(first.length >= 2 ? [first] : []);
  for (const [family, names] of Object.entries(COMPANY_ALIASES)) {
    if (family === first || names.includes(key) || names.includes(first)) {
      terms.add(family);
      for (const n of names) terms.add(n.split(" ")[0]);
    }
  }
  // PostgREST filter values: keep them to letters and digits.
  return [...terms].map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length >= 2).slice(0, 8);
}

export async function loadDecisions(db: Db, userId: string): Promise<AliasDecision[]> {
  const { data } = await db.from("company_aliases").select("a_key, b_key, decision").eq("user_id", userId);
  return (data ?? []).map((d) => ({ aKey: d.a_key, bKey: d.b_key, decision: d.decision as AliasDecision["decision"] }));
}

export async function peopleAtCompany(db: Db, userId: string, company: string, now = Date.now()): Promise<{ confident: PersonAtCompany[]; possible: PersonAtCompany[] }> {
  const terms = searchTerms(company);
  if (!terms.length) return { confident: [], possible: [] };
  const or = (column: string) => terms.map((t) => `${column}.ilike.%${t}%`).join(",");
  const [decisions, connections, people, facts] = await Promise.all([
    loadDecisions(db, userId),
    db.from("known_connections").select("id, full_name, company, position, linkedin_url, created_at, updated_at").eq("user_id", userId).or(or("company")).limit(500),
    db.from("network_people").select("id, full_name, current_title, current_company, linkedin_url, updated_at").eq("user_id", userId).eq("saved", true).or(or("current_company")).limit(500),
    db.from("network_person_facts").select("person_id, value, created_at, source_title, network_sources(fetched_at)").eq("user_id", userId).eq("field", "company").or(or("value")).limit(500),
  ]);

  const out: PersonAtCompany[] = [];
  for (const c of connections.data ?? []) {
    if (!c.company) continue;
    const match = matchCompany(company, c.company, decisions);
    if (match.level === "different") continue;
    // A connection's company is as of the export it came from.
    const seen = c.updated_at > c.created_at ? c.updated_at : c.created_at;
    const age = evidenceAge(seen, now);
    out.push({
      key: `c:${c.id}`,
      kind: "connection",
      personId: null,
      name: c.full_name,
      title: c.position,
      company: c.company,
      linkedinUrl: c.linkedin_url,
      match,
      evidence: { label: `Your LinkedIn connections, imported ${age.ago}`, at: seen, stale: age.stale },
    });
  }

  // Saved People: their listed company, or a company fact found in research (newest source wins).
  const factBy = new Map<string, { value: string; at: string | null; source: string | null }>();
  for (const f of facts.data ?? []) {
    const at = f.network_sources?.fetched_at ?? f.created_at;
    const prev = factBy.get(f.person_id);
    if (!prev || (at && (!prev.at || at > prev.at))) factBy.set(f.person_id, { value: f.value, at, source: f.source_title });
  }
  const peopleBy = new Map((people.data ?? []).map((p) => [p.id, p]));
  const factPeople = [...factBy.keys()].filter((id) => !peopleBy.has(id));
  if (factPeople.length) {
    const { data: more } = await db.from("network_people").select("id, full_name, current_title, current_company, linkedin_url, updated_at").eq("user_id", userId).eq("saved", true).in("id", factPeople.slice(0, 200));
    for (const p of more ?? []) peopleBy.set(p.id, p);
  }
  for (const p of peopleBy.values()) {
    const fact = factBy.get(p.id);
    const listed = p.current_company ? matchCompany(company, p.current_company, decisions) : null;
    const found = fact ? matchCompany(company, fact.value, decisions) : null;
    const best = [listed, found].filter((m): m is CompanyMatch => m !== null && m.level !== "different").sort((a, b) => Number(counts(b)) - Number(counts(a)))[0];
    if (!best) continue;
    const fromFact = best === found && fact;
    const at = fromFact ? fact.at : p.updated_at;
    const age = evidenceAge(at, now);
    out.push({
      key: `p:${p.id}`,
      kind: "person",
      personId: p.id,
      name: p.full_name,
      title: p.current_title,
      company: fromFact ? fact.value : (p.current_company ?? ""),
      linkedinUrl: p.linkedin_url,
      match: best,
      evidence: { label: fromFact ? `Found in ${fact.source ?? "a public source"}, ${age.ago}` : `Saved in People, updated ${age.ago}`, at, stale: age.stale },
    });
  }

  const byName = (a: PersonAtCompany, b: PersonAtCompany) => Number(a.evidence.stale) - Number(b.evidence.stale) || a.name.localeCompare(b.name);
  return { confident: out.filter((p) => counts(p.match)).sort(byName), possible: out.filter((p) => !counts(p.match)).sort(byName) };
}
