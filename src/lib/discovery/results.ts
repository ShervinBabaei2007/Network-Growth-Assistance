import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { clean } from "@/lib/text/match";
import type { Confidence } from "./evidence";
import { linkedInSearchUrl } from "./linkedin-link";
import { suggestIntro, type IntroFacts } from "./messages";
import { rankScore, type ScoreLine } from "./score";
import { loadFacts, selectAll, type Db, type StoredFact } from "./store";

type Enums = Database["public"]["Enums"];
export type Tier = Enums["search_person_tier"];
export type Proximity = Enums["network_proximity"];
export type CrmStatus = Enums["network_person_status"];

export type PersonCard = {
  personId: string;
  fullName: string;
  headline: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  githubUrl: string | null;
  personalWebsite: string | null;
  linkedinUrl: string | null;
  /** Opens a LinkedIn people search when their own profile link isn't known. */
  linkedinSearchUrl: string;
  institution: string | null;
  program: string | null;
  gradYear: string | null;
  tier: Tier;
  tierReason: string | null;
  relevance: number;
  confidence: number;
  rank: number;
  breakdown: ScoreLine[];
  reasons: string[];
  proximity: Proximity;
  knownMatchState: Enums["known_match_state"];
  knownMatchConfidence: number | null;
  knownConnectionName: string | null;
  crmStatus: CrmStatus;
  saved: boolean;
  sourceCount: number;
  networkingValue: number | null;
  reasonForConnecting: string | null;
  conversationAngle: string | null;
  possibleDuplicateOf: string | null;
};

export type ResultFilters = {
  institution?: string;
  program?: string;
  company?: string;
  role?: string;
  location?: string;
  gradYear?: string;
  minScore?: number;
  connection?: Proximity | "";
  confidence?: Confidence | "";
};

const CONF_ORDER: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
const bestFact = (facts: StoredFact[], field: StoredFact["field"]) =>
  facts.filter((f) => f.field === field).sort((a, b) => CONF_ORDER[b.confidence] - CONF_ORDER[a.confidence])[0]?.value ?? null;

const contains = (hay: (string | null)[], needle?: string) => !needle || hay.some((h) => h && clean(h).includes(clean(needle).trim()));

export async function loadSearchResults(db: Db, searchId: string, filters: ResultFilters = {}) {
  const rows = await selectAll((from, to) =>
    db
      .from("network_search_people")
      .select(
        "tier, tier_reason, relevance_score, confidence_score, score_breakdown, reasons, network_people(id, full_name, headline, current_title, current_company, location, github_url, personal_website, linkedin_url, proximity, known_match_state, known_match_confidence, crm_status, saved, networking_value_score, reason_for_connecting, conversation_angle, possible_duplicate_of, known_connections(full_name))",
      )
      .eq("search_id", searchId)
      .range(from, to),
  );
  const ids = rows.flatMap((r) => (r.network_people ? [r.network_people.id] : []));
  const facts = await loadFacts(db, ids);

  const cards: PersonCard[] = rows.flatMap((r) => {
    const p = r.network_people;
    if (!p) return [];
    const f = facts.get(p.id) ?? [];
    const relevance = r.relevance_score ?? 0;
    return [
      {
        personId: p.id,
        fullName: p.full_name,
        headline: p.headline,
        currentTitle: p.current_title,
        currentCompany: p.current_company,
        location: p.location,
        githubUrl: p.github_url,
        personalWebsite: p.personal_website,
        linkedinUrl: p.linkedin_url,
        linkedinSearchUrl: linkedInSearchUrl({ fullName: p.full_name, currentCompany: p.current_company, institution: bestFact(f, "institution") }),
        institution: bestFact(f, "institution"),
        program: bestFact(f, "program"),
        gradYear: bestFact(f, "grad_year"),
        tier: r.tier,
        tierReason: r.tier_reason,
        relevance,
        confidence: r.confidence_score ?? 0,
        rank: rankScore(relevance, p.networking_value_score),
        breakdown: (r.score_breakdown as unknown as ScoreLine[]) ?? [],
        reasons: r.reasons,
        proximity: p.proximity,
        knownMatchState: p.known_match_state,
        knownMatchConfidence: p.known_match_confidence,
        knownConnectionName: p.known_connections?.full_name ?? null,
        crmStatus: p.crm_status,
        saved: p.saved,
        sourceCount: new Set(f.map((x) => x.sourceUrl)).size,
        networkingValue: p.networking_value_score,
        reasonForConnecting: p.reason_for_connecting,
        conversationAngle: p.conversation_angle,
        possibleDuplicateOf: p.possible_duplicate_of,
      },
    ];
  });

  const minConf = filters.confidence === "high" ? 80 : filters.confidence === "medium" ? 50 : 0;
  const filtered = cards.filter(
    (c) =>
      contains([c.institution], filters.institution) &&
      contains([c.program], filters.program) &&
      contains([c.currentCompany], filters.company) &&
      contains([c.currentTitle, c.headline], filters.role) &&
      contains([c.location], filters.location) &&
      (!filters.gradYear || c.gradYear === filters.gradYear) &&
      c.relevance >= (filters.minScore ?? 0) &&
      (!filters.connection || c.proximity === filters.connection) &&
      c.confidence >= minConf,
  );
  filtered.sort((a, b) => b.rank - a.rank || b.relevance - a.relevance || a.fullName.localeCompare(b.fullName));

  // People flagged as possibly already connected are shown for review, not as matches.
  const review = filtered.filter((c) => c.knownMatchState === "needs_review" && (c.tier === "verified" || c.tier === "possible"));
  const inReview = new Set(review.map((c) => c.personId));
  return {
    total: cards.length,
    filteredOut: cards.length - filtered.length,
    verified: filtered.filter((c) => c.tier === "verified" && !inReview.has(c.personId)),
    possible: filtered.filter((c) => c.tier === "possible" && !inReview.has(c.personId)),
    review,
    hidden: filtered.filter((c) => c.tier === "hidden_connected"),
    rejected: filtered.filter((c) => c.tier === "rejected"),
  };
}

export type SearchResults = Awaited<ReturnType<typeof loadSearchResults>>;

export type EvidenceItem = StoredFact & { query: string | null };

export async function loadPersonDetail(db: Db, personId: string) {
  const { data: p } = await db.from("network_people").select("*, known_connections(full_name, company, position)").eq("id", personId).maybeSingle();
  if (!p) return null;
  const [facts, { data: links }, { data: interactions }, { data: feedback }, { data: settings }, { data: dup }] = await Promise.all([
    loadFacts(db, [personId]),
    db
      .from("network_search_people")
      .select("search_id, tier, tier_reason, relevance_score, score_breakdown, reasons, created_at, network_searches(original_query, created_at), network_search_queries(query, provider)")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(10),
    db.from("network_interactions").select("id, kind, body, occurred_at").eq("person_id", personId).order("occurred_at", { ascending: false }).limit(50),
    db.from("network_feedback").select("kind").eq("person_id", personId),
    db.from("settings").select("my_school_text, my_program_text, my_interests, networking_goal").single(),
    p.possible_duplicate_of ? db.from("network_people").select("id, full_name, current_company").eq("id", p.possible_duplicate_of).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const own = facts.get(personId) ?? [];
  const queryIds = [...new Set(own.map((f) => f.queryId).filter((q): q is string => Boolean(q)))];
  const { data: queries } = queryIds.length ? await db.from("network_search_queries").select("id, query").in("id", queryIds) : { data: [] };
  const queryText = new Map((queries ?? []).map((q) => [q.id, q.query]));
  const evidence: EvidenceItem[] = own.map((f) => ({ ...f, query: f.queryId ? (queryText.get(f.queryId) ?? null) : null }));

  // Verified facts only (high or medium) go into the suggested intro.
  const usable = (field: StoredFact["field"]) => own.filter((f) => f.field === field && f.confidence !== "low").sort((a, b) => CONF_ORDER[b.confidence] - CONF_ORDER[a.confidence])[0]?.value ?? null;
  const introFacts: IntroFacts = {
    personId,
    fullName: p.full_name,
    institution: usable("institution"),
    program: usable("program"),
    role: usable("role"),
    company: usable("company"),
    me: { school: settings?.my_school_text ?? null, program: settings?.my_program_text ?? null, interests: settings?.my_interests ?? null, goal: settings?.networking_goal ?? null },
  };

  return {
    person: p,
    evidence,
    searches: (links ?? []).map((l) => ({
      searchId: l.search_id,
      query: l.network_searches?.original_query ?? "",
      tier: l.tier,
      tierReason: l.tier_reason,
      relevance: l.relevance_score,
      breakdown: (l.score_breakdown as unknown as ScoreLine[]) ?? [],
      reasons: l.reasons,
      discoveredVia: l.network_search_queries?.query ?? null,
      at: l.created_at,
    })),
    interactions: interactions ?? [],
    feedback: (feedback ?? []).map((f) => f.kind),
    duplicateOf: dup ?? null,
    introFacts,
    suggestedIntro: suggestIntro(introFacts),
    linkedinSearchUrl: linkedInSearchUrl({ fullName: p.full_name, currentCompany: p.current_company, institution: introFacts.institution }),
  };
}

export type PersonDetail = NonNullable<Awaited<ReturnType<typeof loadPersonDetail>>>;
