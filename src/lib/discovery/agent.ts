import "server-only";
import { loadCatalog } from "@/lib/data/catalog";
import type { Json } from "@/lib/supabase/database.types";
import { clean } from "@/lib/text/match";
import { normalizeName } from "@/lib/text/names";
import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { DEFAULT_BUDGET, pagesThisStep, stopReason, type Budget, type StopReason } from "./budget";
import { institutionMatcher, matchInstitution, NetworkingCriteria } from "./criteria";
import { evaluateCriteria } from "./evidence";
import { matchBand, matchKnownConnection, type KnownConnectionLite, type Override } from "./known-match";
import { logDiscovery } from "./log";
import { parseRequest } from "./parse-request";
import { researchResults } from "./pipeline";
import { planQueries, type PlannedQuery } from "./planner";
import { ProviderError, type SearchResult } from "./providers/types";
import type { DiscoveryServices } from "./providers/registry";
import { rerankPeople, type RerankPerson } from "./rerank";
import { scorePerson, type Feedback } from "./score";
import { addFacts, loadFacts, readPage, readSearchCache, selectAll, upsertPerson, writePage, writeSearchCache, type Db } from "./store";
import { isFetchable } from "./blocklist";
import { mentionsName } from "./evidence";
import type { GitHubProfileSource } from "./providers/github";
import { factsFromOwnPage, linksInMarkdown, markdownToText, ownLinkedIn } from "./verify";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The bounded research agent. Each call to `advanceSearch` runs one short step
 * and saves its progress, so a search survives serverless time limits, reports
 * real progress, and can never run away: every stage is capped by the budget.
 *
 * understanding → planning → searching (repeats) → verifying (repeats) → checking_connections → ranking → explaining → done
 */

export const STAGES = ["understanding", "planning", "searching", "verifying", "checking_connections", "ranking", "explaining", "done"] as const;
export type Stage = (typeof STAGES)[number];

export type SearchState = {
  plan?: (PlannedQuery & { id: string })[];
  cursor?: number;
  emptyBatches?: number;
  seenUrls?: string[];
  linkedinRefs?: { url: string; title: string }[];
  reranked?: string[];
  verified?: string[];
  stopReason?: StopReason;
  parseNote?: string;
  usedAi?: boolean;
  limitations?: string[];
  /** Whether AI explanations can run for this search (the server has a model configured). */
  aiEnabled?: boolean;
};

export type SearchCounters = {
  found: number;
  verified: number;
  possible: number;
  rejected: number;
  hiddenConnected: number;
  needsReview: number;
  possibleDuplicates: number;
};

export type SearchMetrics = {
  queries: number;
  results: number;
  pages: number;
  profiles: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheHits: number;
  providerFailures: number;
  factsDropped: number;
  linkedinResultsSkipped: number;
  candidatesConsidered: number;
  durationMs: number;
  /** What ORCID says it holds for the more specific searches: how many people match, in words. */
  coverage?: { label: string; total: number }[];
};

type SearchRow = Database["public"]["Tables"]["network_searches"]["Row"];

// Longer than any step (routes stop at 60 s), so a crashed step frees the search quickly.
const LEASE_MS = 90_000;
const RERANK_BATCH = 15;

const emptyMetrics = (): SearchMetrics => ({
  queries: 0,
  results: 0,
  pages: 0,
  profiles: 0,
  llmCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheHits: 0,
  providerFailures: 0,
  factsDropped: 0,
  linkedinResultsSkipped: 0,
  candidatesConsidered: 0,
  durationMs: 0,
});

/** Takes the search's lease if nobody else holds it. Returns the row, or null if busy or finished. */
async function claim(db: Db, searchId: string): Promise<SearchRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("network_searches")
    .update({ lease_until: new Date(Date.now() + LEASE_MS).toISOString() })
    .eq("id", searchId)
    .in("status", ["queued", "running"])
    .or(`lease_until.is.null,lease_until.lt."${now}"`)
    .select("*");
  if (error) throw error;
  return data[0] ?? null;
}

export type StepResult = { ran: boolean; stage: string; status: string };

export async function advanceSearch(db: Db, userId: string, searchId: string, services: DiscoveryServices, budget: Budget = DEFAULT_BUDGET): Promise<StepResult> {
  const row = await claim(db, searchId);
  if (!row) return { ran: false, stage: "", status: "" };

  const state: SearchState = (row.state as SearchState) ?? {};
  const metrics: SearchMetrics = { ...emptyMetrics(), ...(row.metrics as Partial<SearchMetrics>) };
  const startedAt = row.started_at ?? new Date().toISOString();
  const usageBefore = services.llm.usage ? { ...services.llm.usage } : null;
  let stage = row.stage as Stage;
  let status: Database["public"]["Enums"]["network_search_status"] = "running";
  let counters = (row.counters as Partial<SearchCounters>) ?? {};
  let criteria = row.criteria ? NetworkingCriteria.safeParse(row.criteria).data ?? null : null;
  let targetCount = row.target_count;
  let errorText: string | null = null;

  try {
    if (stage === "understanding" || !criteria) {
      if (!criteria) {
        // The user's own schools and disciplines help read the request (their spellings count).
        const catalog = await loadCatalog(db, userId).catch(() => undefined);
        const outcome = await parseRequest(services.llm, row.original_query, catalog);
        criteria = outcome.criteria;
        state.usedAi = outcome.usedAi;
        state.parseNote = outcome.note;
        if (outcome.usedAi) metrics.llmCalls++;
      }
      targetCount = criteria.targetCount;
      state.limitations = services.limitations;
      state.aiEnabled = services.llm.enabled;
      logDiscovery("search_started", { searchId, target: targetCount, aiParse: Boolean(state.usedAi) });
      stage = "planning";
    } else if (stage === "planning") {
      const available = new Set(services.providers.map((p) => p.id));
      // Drop sources that aren't configured first, so the whole query budget goes to usable searches.
      const planned = planQueries(criteria, 500).filter((q) => available.has(q.provider)).slice(0, budget.maxSearchQueries);
      if (planned.length) {
        await db.from("network_search_queries").upsert(
          planned.map((q) => ({ user_id: userId, search_id: searchId, provider: q.provider, query: q.query, family: q.family })),
          { onConflict: "user_id,search_id,provider,query", ignoreDuplicates: true },
        );
      }
      const { data: rows } = await db.from("network_search_queries").select("id, provider, query").eq("search_id", searchId);
      const ids = new Map((rows ?? []).map((r) => [`${r.provider}\n${r.query}`, r.id]));
      state.plan = planned.flatMap((q) => (ids.get(`${q.provider}\n${q.query}`) ? [{ ...q, id: ids.get(`${q.provider}\n${q.query}`)! }] : []));
      state.cursor = 0;
      state.emptyBatches = 0;
      stage = "searching";
    } else if (stage === "searching") {
      const r = await searchStep(db, userId, searchId, criteria, state, metrics, services, budget, counters);
      counters = r.counters;
      if (r.stop) {
        state.stopReason = r.stop;
        stage = "verifying";
      }
    } else if (stage === "verifying") {
      const more = await verifyStep(db, userId, searchId, criteria, state, metrics, services, budget);
      if (!more) stage = "checking_connections";
    } else if (stage === "checking_connections") {
      await attachLinkedInRefs(db, searchId, criteria, state.linkedinRefs ?? []);
      await checkKnownConnections(db, searchId);
      stage = "ranking";
    } else if (stage === "ranking") {
      counters = await rescoreSearch(db, userId, searchId, criteria);
      stage = services.llm.enabled ? "explaining" : "done";
    } else if (stage === "explaining") {
      const more = await explainStep(db, searchId, criteria, row.original_query, state, metrics, services, budget);
      if (!more) stage = "done";
    }

    if (stage === "done") {
      status = "completed";
      logDiscovery("search_completed", { searchId, verified: counters.verified ?? 0, possible: counters.possible ?? 0, queries: metrics.queries, pages: metrics.pages, llmCalls: metrics.llmCalls });
    }
  } catch (e) {
    status = "failed";
    errorText = "The research stopped because of an unexpected error. Results found so far are kept.";
    logDiscovery("search_failed", { searchId, stage, error: e instanceof Error ? e.name : "unknown" });
  }

  if (usageBefore && services.llm.usage) {
    metrics.inputTokens += services.llm.usage.inputTokens - usageBefore.inputTokens;
    metrics.outputTokens += services.llm.usage.outputTokens - usageBefore.outputTokens;
  }
  const finished = status !== "running";
  metrics.durationMs = Date.now() - Date.parse(startedAt);
  await db
    .from("network_searches")
    .update({
      criteria: criteria as unknown as NonNullable<Json>,
      target_count: targetCount,
      stage,
      status,
      state: state as unknown as NonNullable<Json>,
      counters: counters as unknown as NonNullable<Json>,
      budget: budget as unknown as NonNullable<Json>,
      metrics: metrics as unknown as NonNullable<Json>,
      error: errorText,
      started_at: startedAt,
      finished_at: finished ? new Date().toISOString() : null,
      lease_until: null,
    })
    .eq("id", searchId);
  logDiscovery("search_step", { searchId, stage, status });
  return { ran: true, stage, status };
}

// ------------------------------------------------------------- searching

async function searchStep(
  db: Db,
  userId: string,
  searchId: string,
  criteria: NetworkingCriteria,
  state: SearchState,
  metrics: SearchMetrics,
  services: DiscoveryServices,
  budget: Budget,
  counters: Partial<SearchCounters>,
): Promise<{ counters: SearchCounters; stop: StopReason | null }> {
  const plan = state.plan ?? [];
  const cursor = state.cursor ?? 0;
  const progress = () => ({
    queriesRun: metrics.queries,
    pagesProcessed: metrics.pages,
    candidatesConsidered: metrics.candidatesConsidered,
    llmCalls: metrics.llmCalls,
    verified: counters.verified ?? 0,
    emptyBatches: state.emptyBatches ?? 0,
    queriesRemaining: plan.length - (state.cursor ?? 0),
  });
  const early = stopReason(progress(), budget, criteria.targetCount);
  if (early) return { counters: await countSearch(db, searchId), stop: early };

  const batch = plan.slice(cursor, cursor + Math.min(budget.queriesPerStep, budget.maxSearchQueries - metrics.queries));
  const providers = new Map(services.providers.map((p) => [p.id, p]));
  const tagged: (SearchResult & { queryId: string })[] = [];

  await Promise.all(
    batch.map(async (q) => {
      const provider = providers.get(q.provider);
      if (!provider) return;
      let results = await readSearchCache(db, provider.name, q.query);
      let error: string | null = null;
      if (results) metrics.cacheHits++;
      else {
        try {
          results = await provider.search(q.query);
          await writeSearchCache(db, userId, provider.name, q.query, results);
        } catch (e) {
          error = e instanceof ProviderError ? e.message : "Search failed.";
          metrics.providerFailures++;
          logDiscovery("provider_failed", { searchId, provider: provider.name, retryable: e instanceof ProviderError ? e.retryable : false });
          results = [];
        }
      }
      metrics.queries++;
      metrics.results += results.length;
      if (q.provider === "orcid" && q.label && !error) {
        const total = results.find((r) => r.total !== undefined)?.total ?? 0;
        // The same subject can be searched under another spelling (SFU); the larger count is the registry's.
        const same = (metrics.coverage ?? []).find((c) => c.label === q.label);
        metrics.coverage = [...(metrics.coverage ?? []).filter((c) => c.label !== q.label), { label: q.label, total: Math.max(total, same?.total ?? 0) }].slice(-12);
      }
      tagged.push(...results.map((r) => ({ ...r, queryId: q.id })));
      await db.from("network_search_queries").update({ result_count: results.length, error, executed_at: new Date().toISOString() }).eq("id", q.id);
    }),
  );
  state.cursor = cursor + batch.length;

  const seenUrls = new Set(state.seenUrls ?? []);
  const research = await researchResults(tagged, {
    fetcher: services.fetcher,
    llm: services.llm,
    criteria,
    seenUrls,
    pageBudget: pagesThisStep(progress(), budget),
    llmBudget: Math.max(0, budget.maxLlmCalls - metrics.llmCalls),
    cachedPage: (url) => readPage(db, url),
    savePage: (page, provider) => writePage(db, userId, page, provider),
  });
  state.seenUrls = [...seenUrls].slice(-1500);
  state.linkedinRefs = [...(state.linkedinRefs ?? []), ...research.linkedinRefs].slice(-200);
  metrics.pages += research.pagesProcessed;
  metrics.profiles += research.profilesRead;
  metrics.llmCalls += research.llmCalls;
  metrics.factsDropped += research.factsDropped;
  metrics.linkedinResultsSkipped += research.skipped.linkedin;
  if (research.factsDropped) logDiscovery("llm_output_rejected", { searchId, facts: research.factsDropped });

  const queryByUrl = new Map(tagged.map((t) => [t.url, t.queryId]));
  const inst = institutionMatcher(criteria)?.name ?? null;
  let newPeople = 0;
  const touched = new Set<string>();
  for (const d of research.drafts) {
    if (metrics.candidatesConsidered >= budget.maxCandidatesConsidered) break;
    metrics.candidatesConsidered++;
    const r = await upsertPerson(db, userId, searchId, queryByUrl.get(d.resultUrl) ?? null, d, inst);
    touched.add(r.personId);
    if (r.newToSearch) newPeople++;
    logDiscovery(r.merged ? "candidate_merged" : "candidate_discovered", { searchId, personId: r.personId, possibleDuplicate: r.possibleDuplicate });
  }
  if (touched.size) await rescoreSearch(db, userId, searchId, criteria, [...touched]);
  state.emptyBatches = newPeople === 0 ? (state.emptyBatches ?? 0) + 1 : 0;

  const fresh = await countSearch(db, searchId);
  Object.assign(counters, fresh);
  return { counters: fresh, stop: stopReason(progress(), budget, criteria.targetCount) };
}

// -------------------------------------------------------------- counting

export async function countSearch(db: Db, searchId: string): Promise<SearchCounters> {
  const rows = await selectAll((from, to) =>
    db.from("network_search_people").select("tier, network_people(known_match_state, possible_duplicate_of)").eq("search_id", searchId).range(from, to),
  );
  const c: SearchCounters = { found: rows.length, verified: 0, possible: 0, rejected: 0, hiddenConnected: 0, needsReview: 0, possibleDuplicates: 0 };
  for (const r of rows) {
    if (r.tier === "verified") c.verified++;
    else if (r.tier === "possible") c.possible++;
    else if (r.tier === "rejected") c.rejected++;
    else c.hiddenConnected++;
    if (r.network_people?.known_match_state === "needs_review" && r.tier !== "rejected") c.needsReview++;
    if (r.network_people?.possible_duplicate_of) c.possibleDuplicates++;
  }
  return c;
}

// ---------------------------------------------------------------- scoring

/** Recomputes evidence, scores and tiers for people in a search (all, or just `only`). */
export async function rescoreSearch(db: Db, userId: string, searchId: string, criteria: NetworkingCriteria, only?: string[]): Promise<SearchCounters> {
  let q = db
    .from("network_search_people")
    .select("person_id, query_id, network_people(full_name, normalized_name, known_match_state)")
    .eq("search_id", searchId);
  if (only) q = q.in("person_id", only);
  const links = await selectAll((from, to) => q.range(from, to));
  if (!links.length) return countSearch(db, searchId);
  const ids = links.map((l) => l.person_id);
  const facts = await loadFacts(db, ids);
  const feedback = await loadFeedback(db, ids);

  const searchRows: Database["public"]["Tables"]["network_search_people"]["Insert"][] = [];
  const personRows: { id: string; relevance: number; confidence: number; reasons: string[] }[] = [];
  for (const l of links) {
    const fb = feedback.get(l.person_id) ?? { kinds: new Set<string>(), bonus: 0 };
    let personFacts = facts.get(l.person_id) ?? [];
    if (fb.kinds.has("wrong_program")) personFacts = personFacts.filter((f) => f.field !== "program");
    const evaluation = evaluateCriteria(personFacts, criteria);
    const excluded = fb.kinds.has("not_relevant") || fb.kinds.has("wrong_person");
    const f: Feedback = { excluded, bonus: fb.bonus, note: fb.kinds.has("wrong_person") ? "You marked this as the wrong person" : "You marked this person not relevant" };
    const s = scorePerson(evaluation, personFacts, undefined, f);
    const state = l.network_people?.known_match_state;
    const hidden = criteria.excludeExistingConnections && (state === "auto_hidden" || state === "confirmed_same" || fb.kinds.has("already_connected"));
    const tier = hidden ? "hidden_connected" : s.tier;
    if (s.tier === "rejected" && !hidden) logDiscovery("candidate_rejected", { searchId, personId: l.person_id });
    searchRows.push({
      user_id: userId,
      search_id: searchId,
      person_id: l.person_id,
      query_id: l.query_id,
      tier,
      tier_reason: hidden ? "Likely already one of your connections" : s.tierReason,
      relevance_score: s.relevance,
      confidence_score: s.confidence,
      score_breakdown: s.breakdown as unknown as NonNullable<Json>,
      reasons: s.reasons,
    });
    personRows.push({ id: l.person_id, relevance: s.relevance, confidence: s.confidence, reasons: s.reasons });
  }
  for (let i = 0; i < searchRows.length; i += 200) {
    const { error } = await db.from("network_search_people").upsert(searchRows.slice(i, i + 200), { onConflict: "user_id,search_id,person_id" });
    if (error) throw error;
  }
  // The person record keeps the latest scores for sorting saved people.
  await Promise.all(personRows.map((p) => db.from("network_people").update({ relevance_score: p.relevance, confidence_score: p.confidence, reasons: p.reasons }).eq("id", p.id)));
  return countSearch(db, searchId);
}

/** Feedback per person, plus a small bonus for employers the user has marked great matches before. */
async function loadFeedback(db: Db, personIds: string[]): Promise<Map<string, { kinds: Set<string>; bonus: number }>> {
  const out = new Map<string, { kinds: Set<string>; bonus: number }>();
  const [{ data: own }, { data: great }, { data: people }] = await Promise.all([
    db.from("network_feedback").select("person_id, kind").in("person_id", personIds.slice(0, 1000)),
    db.from("network_feedback").select("network_people(current_company)").eq("kind", "great_match").limit(200),
    db.from("network_people").select("id, current_company").in("id", personIds.slice(0, 1000)),
  ]);
  const greatCompanies = new Set((great ?? []).map((g) => clean(g.network_people?.current_company).trim()).filter(Boolean));
  for (const p of people ?? []) {
    const bonus = p.current_company && greatCompanies.has(clean(p.current_company).trim()) ? 3 : 0;
    out.set(p.id, { kinds: new Set(), bonus });
  }
  for (const f of own ?? []) {
    const entry = out.get(f.person_id) ?? { kinds: new Set<string>(), bonus: 0 };
    entry.kinds.add(f.kind);
    out.set(f.person_id, entry);
  }
  return out;
}

// --------------------------------------------------- known connections

/**
 * Compares everyone in the search with the user's own 1st-degree list. Only
 * that list is used; nothing is asked of LinkedIn.
 */
export async function checkKnownConnections(db: Db, searchId: string) {
  const [links, known, connectedCandidates, overrideRows] = await Promise.all([
    selectAll((from, to) =>
      db
        .from("network_search_people")
        .select("person_id, network_people(full_name, current_company, current_title, linkedin_key, proximity, known_match_state)")
        .eq("search_id", searchId)
        .range(from, to),
    ),
    selectAll((from, to) => db.from("known_connections").select("id, full_name, company, position, linkedin_key").range(from, to)),
    selectAll((from, to) => db.from("candidates").select("full_name, profile_key, role").not("connected_via", "is", null).range(from, to)),
    selectAll((from, to) => db.from("network_connection_overrides").select("identity_signature, known_connection_id, same_person").range(from, to)),
  ]);
  const knownList: KnownConnectionLite[] = [
    ...known.map((k) => ({ id: k.id, fullName: k.full_name, company: k.company, position: k.position, linkedinKey: k.linkedin_key })),
    ...connectedCandidates.map((c) => ({ id: null, fullName: c.full_name, company: null, position: c.role, linkedinKey: c.profile_key })),
  ];
  const overrides = new Map<string, Override[]>();
  for (const o of overrideRows) overrides.set(o.identity_signature, [...(overrides.get(o.identity_signature) ?? []), { knownConnectionId: o.known_connection_id, samePerson: o.same_person }]);

  const ids = links.map((l) => l.person_id);
  const facts = await loadFacts(db, ids);
  let matched = 0;
  for (const l of links) {
    const p = l.network_people;
    if (!p) continue;
    // The user's own decision for this person stands.
    if (p.known_match_state === "confirmed_same" || p.known_match_state === "confirmed_different") continue;
    const m = matchKnownConnection(
      {
        fullName: p.full_name,
        currentCompany: p.current_company,
        currentTitle: p.current_title,
        linkedinKey: p.linkedin_key,
        institutions: (facts.get(l.person_id) ?? []).filter((f) => f.field === "institution").map((f) => f.value),
      },
      knownList,
      overrides,
    );
    const band = m ? matchBand(m.confidence) : "none";
    const confirmedByUser = m?.signals.includes("confirmed by you");
    const manual = p.proximity === "manual_second" || p.proximity === "manual_third";
    const proximity = band === "auto_hidden" ? "connected" : manual ? p.proximity : band === "none" && knownList.length ? "not_connected" : "unknown";
    if (band !== "none") matched++;
    await db
      .from("network_people")
      .update({
        known_connection_id: band === "none" ? null : m?.known.id ?? null,
        known_match_confidence: m ? Math.round(m.confidence * 100) / 100 : null,
        known_match_state: confirmedByUser ? "confirmed_same" : band,
        proximity,
      })
      .eq("id", l.person_id);
  }
  if (matched) logDiscovery("matched_known_connection", { searchId, count: matched });
}

/**
 * LinkedIn results that showed up in web search are never fetched. If a result's
 * title names someone already found (and mentions their employer or school),
 * its URL is kept as a link the user can open themselves.
 */
async function attachLinkedInRefs(db: Db, searchId: string, criteria: NetworkingCriteria, refs: { url: string; title: string }[]) {
  if (!refs.length) return;
  const inst = institutionMatcher(criteria);
  const { data: links } = await db
    .from("network_search_people")
    .select("person_id, network_people(normalized_name, current_company, linkedin_key)")
    .eq("search_id", searchId);
  for (const ref of refs) {
    const url = normalizeProfileUrl(ref.url);
    if (!url.ok) continue;
    const name = normalizeName(ref.title.split(/\s[-–|·]\s/)[0] ?? "");
    const hits = (links ?? []).filter((l) => {
      const p = l.network_people;
      if (!p || p.linkedin_key || p.normalized_name !== name) return false;
      const company = p.current_company ? clean(ref.title).includes(clean(p.current_company)) : false;
      const school = inst ? matchInstitution(ref.title, inst) !== null : false;
      return company || school;
    });
    // Ambiguous (two people with that name) means we don't guess.
    if (hits.length === 1) {
      await db.from("network_people").update({ linkedin_url: url.url, linkedin_key: url.key }).eq("id", hits[0].person_id).is("linkedin_key", null);
    }
  }
}

// ------------------------------------------------------------- explaining

async function explainStep(
  db: Db,
  searchId: string,
  criteria: NetworkingCriteria,
  request: string,
  state: SearchState,
  metrics: SearchMetrics,
  services: DiscoveryServices,
  budget: Budget,
): Promise<boolean> {
  const done = new Set(state.reranked ?? []);
  if (done.size >= budget.maxReranked || metrics.llmCalls >= budget.maxLlmCalls + 5) return false;
  const { data: rows } = await db
    .from("network_search_people")
    .select("person_id, relevance_score, network_people(full_name)")
    .eq("search_id", searchId)
    .in("tier", ["verified", "possible"])
    .order("relevance_score", { ascending: false })
    .limit(budget.maxReranked);
  const next = (rows ?? []).filter((r) => !done.has(r.person_id)).slice(0, RERANK_BATCH);
  if (!next.length) return false;

  const facts = await loadFacts(db, next.map((r) => r.person_id));
  const people: RerankPerson[] = next.map((r) => ({
    id: r.person_id,
    name: r.network_people?.full_name ?? "",
    relevance: r.relevance_score ?? 0,
    facts: (facts.get(r.person_id) ?? [])
      .filter((f) => f.confidence !== "low")
      .slice(0, 12)
      .map((f) => ({ id: f.id, field: f.field, value: f.value, confidence: f.confidence })),
  }));
  const { data: settings } = await db.from("settings").select("my_school_text, my_program_text, my_interests, networking_goal").single();
  const res = await rerankPeople(services.llm, people, {
    goal: criteria.goal ?? settings?.networking_goal ?? null,
    me: { school: settings?.my_school_text ?? null, program: settings?.my_program_text ?? null, interests: settings?.my_interests ?? null },
    request,
  });
  metrics.llmCalls++;
  if (res.rejected) logDiscovery("llm_output_rejected", { searchId, explanations: res.rejected });
  await Promise.all(
    [...res.results].map(([id, r]) =>
      db
        .from("network_people")
        .update({ networking_value_score: r.networkingValueScore, reason_for_connecting: r.reasonForConnecting, conversation_angle: r.conversationAngle })
        .eq("id", id),
    ),
  );
  state.reranked = [...done, ...next.map((r) => r.person_id)];
  // A failed call ends this stage; deterministic reasons are still shown.
  return !res.error && next.length === RERANK_BATCH;
}

// ------------------------------------------------------------- verifying

/**
 * Reads the top people's own pages to confirm or add facts, without AI: their GitHub
 * profile README and social links, and the website they list on their profile. Their
 * own LinkedIn link is kept when they published exactly one. LinkedIn is never fetched.
 */
async function verifyStep(
  db: Db,
  userId: string,
  searchId: string,
  criteria: NetworkingCriteria,
  state: SearchState,
  metrics: SearchMetrics,
  services: DiscoveryServices,
  budget: Budget,
): Promise<boolean> {
  const done = new Set(state.verified ?? []);
  if (done.size >= budget.maxVerified) return false;
  const { data: rows } = await db
    .from("network_search_people")
    .select("person_id, network_people(full_name, github_login, personal_website, linkedin_key, identity_keys)")
    .eq("search_id", searchId)
    .in("tier", ["verified", "possible"])
    .order("relevance_score", { ascending: false })
    .limit(budget.maxVerified);
  const candidates = (rows ?? []).filter((r) => !done.has(r.person_id) && (r.network_people?.github_login || r.network_people?.personal_website));
  const next = candidates.slice(0, Math.min(budget.verifyPerStep, budget.maxVerified - done.size));
  if (!next.length) return false;

  const gh = services.providers.find((p) => p.id === "github") as (GitHubProfileSource & { id: string }) | undefined;
  const canReadGitHub = Boolean(gh && "profileReadme" in gh);

  await Promise.all(
    next.map(async (r) => {
      const p = r.network_people!;
      let linkedin: { url: string; key: string } | null = null;

      if (p.github_login && canReadGitHub) {
        const [links, readme] = await Promise.all([gh!.socialLinks(p.github_login), gh!.profileReadme(p.github_login)]);
        metrics.profiles += 2;
        linkedin = ownLinkedIn(links);
        if (readme) {
          const page = { url: `https://github.com/${p.github_login}/${p.github_login}`, title: `GitHub profile README · ${p.github_login}`, text: markdownToText(readme) };
          const facts = factsFromOwnPage(page, { fullName: p.full_name }, criteria, { personal: true });
          await addFacts(db, userId, r.person_id, facts, null, { url: page.url, title: page.title, provider: "github", excerpt: page.text.slice(0, 4000) });
          linkedin ??= ownLinkedIn(linksInMarkdown(readme));
        }
      }

      const site = p.personal_website;
      if (site && isFetchable(site) && metrics.pages < budget.maxPagesProcessed) {
        let page = await readPage(db, site);
        if (!page) {
          const fetched = await services.fetcher.fetch(site);
          if (fetched.ok) {
            page = { url: fetched.url, title: fetched.title, text: fetched.text, links: fetched.links };
            await writePage(db, userId, page, "web");
          }
        }
        if (page) {
          metrics.pages++;
          // Their own site if it names them up front; otherwise only lines that name them count.
          const personal = mentionsName(`${page.title}\n${page.text.slice(0, 3000)}`, p.full_name);
          await addFacts(db, userId, r.person_id, factsFromOwnPage(page, { fullName: p.full_name }, criteria, { personal }), null);
          if (personal) linkedin ??= ownLinkedIn(page.links);
        }
      }

      if (linkedin && !p.linkedin_key) {
        await db
          .from("network_people")
          .update({ linkedin_url: linkedin.url, linkedin_key: linkedin.key, identity_keys: [...new Set([...p.identity_keys, `linkedin:${linkedin.key}`])] })
          .eq("id", r.person_id)
          .is("linkedin_key", null);
      }
    }),
  );

  const ids = next.map((r) => r.person_id);
  await rescoreSearch(db, userId, searchId, criteria, ids);
  state.verified = [...done, ...ids];
  return candidates.length > next.length;
}
