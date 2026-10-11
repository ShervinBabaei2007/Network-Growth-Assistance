import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { normalizeName, splitName } from "@/lib/text/names";
import { identityKeys, type PageInput, type PersonDraft } from "./extract";
import type { Fact } from "./evidence";
import type { SearchResult } from "./providers/types";
import { resolveIdentity, type IdentityRecord } from "./resolve";

/** Database access for discovery. Every call runs as the signed-in user, so RLS scopes it. */

export type Db = SupabaseClient<Database>;

export const SEARCH_CACHE_MS = 3 * 24 * 60 * 60_000;
export const PAGE_CACHE_MS = 14 * 24 * 60 * 60_000;

export const hashKey = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);
const canonicalUrl = (u: string) => u.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();

// ----------------------------------------------------------------- caches

export async function readSearchCache(db: Db, provider: string, query: string): Promise<SearchResult[] | null> {
  const { data } = await db
    .from("network_search_cache")
    .select("results")
    .eq("provider", provider)
    .eq("query_hash", hashKey(query.toLowerCase().replace(/\s+/g, " ").trim()))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return Array.isArray(data?.results) ? (data.results as unknown as SearchResult[]) : null;
}

export async function writeSearchCache(db: Db, userId: string, provider: string, query: string, results: SearchResult[]) {
  await db.from("network_search_cache").upsert(
    {
      user_id: userId,
      provider,
      query_hash: hashKey(query.toLowerCase().replace(/\s+/g, " ").trim()),
      results: results as unknown as NonNullable<Json>,
      expires_at: new Date(Date.now() + SEARCH_CACHE_MS).toISOString(),
    },
    { onConflict: "user_id,provider,query_hash" },
  );
}

export async function readPage(db: Db, url: string): Promise<PageInput | null> {
  const { data } = await db
    .from("network_sources")
    .select("url, title, text_excerpt, links")
    .eq("url_hash", hashKey(canonicalUrl(url)))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data?.text_excerpt) return null;
  return { url: data.url, title: data.title ?? "", text: data.text_excerpt, links: data.links };
}

export async function writePage(db: Db, userId: string, page: PageInput, provider: string) {
  await db.from("network_sources").upsert(
    {
      user_id: userId,
      url: page.url,
      url_hash: hashKey(canonicalUrl(page.url)),
      title: page.title.slice(0, 300) || null,
      provider,
      text_excerpt: page.text.slice(0, 60_000),
      links: page.links.slice(0, 300),
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + PAGE_CACHE_MS).toISOString(),
    },
    { onConflict: "user_id,url_hash" },
  );
}

type ProfileSource = { url: string; title: string | null; provider: string; excerpt: string | null };

/** Source ids for fact URLs. Structured profiles (no fetched page) are first recorded as sources. */
async function sourceIds(db: Db, userId: string, facts: Fact[], profile?: ProfileSource): Promise<Map<string, string>> {
  const urls = [...new Set(facts.map((f) => f.sourceUrl))];
  if (profile && urls.includes(profile.url)) {
    await db.from("network_sources").upsert(
      {
        user_id: userId,
        url: profile.url,
        url_hash: hashKey(canonicalUrl(profile.url)),
        title: profile.title,
        provider: profile.provider,
        text_excerpt: profile.excerpt,
        expires_at: new Date(Date.now() + PAGE_CACHE_MS).toISOString(),
      },
      { onConflict: "user_id,url_hash", ignoreDuplicates: true },
    );
  }
  const { data } = await db.from("network_sources").select("id, url_hash").in("url_hash", urls.map((u) => hashKey(canonicalUrl(u))));
  const byHash = new Map((data ?? []).map((r) => [r.url_hash, r.id]));
  return new Map(urls.flatMap((u) => (byHash.get(hashKey(canonicalUrl(u))) ? [[u, byHash.get(hashKey(canonicalUrl(u)))!]] : [])));
}

/** Stores evidence for a person; facts already stored from the same source are skipped. */
export async function addFacts(db: Db, userId: string, personId: string, facts: Fact[], queryId: string | null, profile?: ProfileSource) {
  if (!facts.length) return;
  const sources = await sourceIds(db, userId, facts, profile);
  await db.from("network_person_facts").upsert(
    facts.map((f) => ({
      user_id: userId,
      person_id: personId,
      field: f.field,
      value: f.value.slice(0, 500),
      source_id: sources.get(f.sourceUrl) ?? null,
      source_url: f.sourceUrl,
      source_title: f.sourceTitle,
      extracted_text: f.extractedText.slice(0, 1000),
      confidence: f.confidence,
      query_id: queryId,
    })),
    { onConflict: "user_id,person_id,field,value,source_url", ignoreDuplicates: true },
  );
}

// ------------------------------------------------------- people and facts

type ExistingPerson = IdentityRecord & {
  id: string;
  headline: string | null;
  current_title: string | null;
  github_url: string | null;
  github_login: string | null;
  personal_website: string | null;
  linkedin_url: string | null;
  linkedin_key: string | null;
};

const PERSON_COLUMNS = "id, full_name, current_company, current_title, location, identity_keys, headline, github_url, github_login, personal_website, linkedin_url, linkedin_key";

export type UpsertOutcome = { personId: string; merged: boolean; newToSearch: boolean; possibleDuplicate: boolean };

/**
 * Saves a found person: merges into an existing record only when identity
 * resolution is confident, otherwise creates a new one (flagged as a possible
 * duplicate if it looks close). Then stores their evidence and links them to the search.
 */
export async function upsertPerson(db: Db, userId: string, searchId: string, queryId: string | null, draft: PersonDraft, institution: string | null): Promise<UpsertOutcome> {
  const normalized = normalizeName(draft.fullName);
  const last = normalized.split(" ").pop() ?? normalized;
  const keys = identityKeys(draft);

  const [byName, byKeys] = await Promise.all([
    db.from("network_people").select(PERSON_COLUMNS).like("normalized_name", `% ${last}`).limit(50),
    keys.length ? db.from("network_people").select(PERSON_COLUMNS).overlaps("identity_keys", keys).limit(10) : Promise.resolve({ data: [] as never[] }),
  ]);
  const rows = new Map<string, NonNullable<typeof byName.data>[number]>();
  for (const r of [...(byName.data ?? []), ...(byKeys.data ?? [])]) rows.set(r.id, r);

  const insts = new Map<string, string[]>();
  if (rows.size) {
    const { data } = await db.from("network_person_facts").select("person_id, value").eq("field", "institution").in("person_id", [...rows.keys()]);
    for (const f of data ?? []) insts.set(f.person_id, [...(insts.get(f.person_id) ?? []), f.value]);
  }
  const existing: ExistingPerson[] = [...rows.values()].map((r) => ({
    ...r,
    fullName: r.full_name,
    currentCompany: r.current_company,
    location: r.location,
    identityKeys: r.identity_keys,
    institutions: insts.get(r.id) ?? [],
  }));

  const draftInstitutions = draft.facts.filter((f) => f.field === "institution").map((f) => f.value);
  const decision = resolveIdentity<ExistingPerson>(
    { fullName: draft.fullName, currentCompany: draft.currentCompany, institutions: institution && draftInstitutions.length ? draftInstitutions : [], location: draft.location, identityKeys: keys },
    existing,
  );

  let personId: string;
  let merged = false;
  let possibleDuplicate = false;
  if (decision.kind === "merge") {
    const p = decision.into;
    personId = p.id;
    merged = true;
    const fill = <T>(current: T | null, next: T | null) => current ?? next ?? null;
    await db
      .from("network_people")
      .update({
        headline: fill(p.headline, draft.headline),
        current_title: fill(p.current_title, draft.currentTitle),
        current_company: fill(p.currentCompany, draft.currentCompany),
        location: fill(p.location, draft.location),
        github_url: fill(p.github_url, draft.githubUrl),
        github_login: fill(p.github_login, draft.githubLogin),
        personal_website: fill(p.personal_website, draft.personalWebsite),
        linkedin_url: fill(p.linkedin_url, draft.linkedinUrl),
        linkedin_key: fill(p.linkedin_key, draft.linkedinKey),
        identity_keys: [...new Set([...p.identityKeys, ...keys])],
      })
      .eq("id", p.id);
  } else {
    const split = splitName(draft.fullName);
    possibleDuplicate = Boolean(decision.possibleDuplicateOf);
    const { data, error } = await db
      .from("network_people")
      .insert({
        user_id: userId,
        full_name: draft.fullName,
        first_name: split.first,
        last_name: split.last,
        normalized_name: normalized,
        headline: draft.headline,
        current_title: draft.currentTitle,
        current_company: draft.currentCompany,
        location: draft.location,
        github_url: draft.githubUrl,
        github_login: draft.githubLogin,
        personal_website: draft.personalWebsite,
        linkedin_url: draft.linkedinUrl,
        linkedin_key: draft.linkedinKey,
        identity_keys: keys,
        possible_duplicate_of: decision.possibleDuplicateOf?.id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    personId = data.id;
  }

  await addFacts(
    db,
    userId,
    personId,
    draft.facts,
    queryId,
    draft.profile ? { url: draft.sourceUrl, title: draft.sourceTitle, provider: draft.profile.provider, excerpt: draft.profile.excerpt } : undefined,
  );

  const { data: link } = await db
    .from("network_search_people")
    .upsert({ user_id: userId, search_id: searchId, person_id: personId, query_id: queryId }, { onConflict: "user_id,search_id,person_id", ignoreDuplicates: true })
    .select("id");
  return { personId, merged, newToSearch: (link?.length ?? 0) > 0, possibleDuplicate };
}

export type StoredFact = Fact & { id: string; personId: string; queryId: string | null };

export async function loadFacts(db: Db, personIds: string[]): Promise<Map<string, StoredFact[]>> {
  const out = new Map<string, StoredFact[]>();
  for (let i = 0; i < personIds.length; i += 100) {
    const { data, error } = await db
      .from("network_person_facts")
      .select("id, person_id, field, value, source_url, source_title, extracted_text, confidence, query_id")
      .in("person_id", personIds.slice(i, i + 100));
    if (error) throw error;
    for (const f of data) {
      const fact: StoredFact = {
        id: f.id,
        personId: f.person_id,
        queryId: f.query_id,
        field: f.field,
        value: f.value,
        sourceUrl: f.source_url,
        sourceTitle: f.source_title,
        extractedText: f.extracted_text,
        confidence: f.confidence,
      };
      out.set(f.person_id, [...(out.get(f.person_id) ?? []), fact]);
    }
  }
  return out;
}

/** All rows of a query, a page at a time (PostgREST caps each response). */
export async function selectAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 1000, max = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
