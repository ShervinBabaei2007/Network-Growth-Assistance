import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { STAGES, type SearchCounters, type SearchMetrics, type SearchState, type Stage } from "./agent";
import { STOP_LABELS } from "./budget";
import { DEFAULT_TARGET, NetworkingCriteria } from "./criteria";
import type { Db } from "./store";

/** Searches a user may start: one at a time, and a daily cap to bound cost. */
export const MAX_SEARCHES_PER_DAY = 20;
const STALE_RUNNING_MS = 10 * 60_000;

export type StartResult = { ok: true; id: string } | { ok: false; status: number; error: string };

export async function startSearch(db: Db, userId: string, input: { query: string; criteria?: NetworkingCriteria | null; parentSearchId?: string | null }): Promise<StartResult> {
  const query = input.query.trim().replace(/\s+/g, " ");
  if (query.length < 3) return { ok: false, status: 400, error: "Describe who you'd like to meet." };
  if (query.length > 1000) return { ok: false, status: 400, error: "Keep the request under 1,000 characters." };

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [{ data: active }, { count }] = await Promise.all([
    db.from("network_searches").select("id, updated_at").in("status", ["queued", "running"]),
    db.from("network_searches").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const live = (active ?? []).filter((s) => Date.now() - Date.parse(s.updated_at) < STALE_RUNNING_MS);
  if (live.length) return { ok: false, status: 409, error: "Another search is still running. Wait for it to finish or cancel it." };
  // Searches abandoned mid-way (tab closed for 10+ minutes) are closed so they don't block new ones.
  const stale = (active ?? []).filter((s) => !live.includes(s)).map((s) => s.id);
  if (stale.length) await db.from("network_searches").update({ status: "cancelled", finished_at: new Date().toISOString(), error: "Stopped after being left unattended." }).in("id", stale);
  if ((count ?? 0) >= MAX_SEARCHES_PER_DAY) return { ok: false, status: 429, error: `You can run ${MAX_SEARCHES_PER_DAY} searches a day. Try again tomorrow.` };

  const criteria = input.criteria ? NetworkingCriteria.safeParse(input.criteria) : null;
  if (criteria && !criteria.success) return { ok: false, status: 400, error: "Those criteria aren't valid." };
  const { data, error } = await db
    .from("network_searches")
    .insert({
      user_id: userId,
      original_query: query,
      criteria: (criteria?.data ?? null) as unknown as Json,
      target_count: criteria?.data.targetCount ?? DEFAULT_TARGET,
      parent_search_id: input.parentSearchId ?? null,
      stage: "understanding",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, status: 500, error: "Couldn't start the search. Try again." };
  return { ok: true, id: data.id };
}

export type SearchView = {
  id: string;
  query: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: Stage;
  stageIndex: number;
  targetCount: number;
  criteria: NetworkingCriteria | null;
  counters: Partial<SearchCounters>;
  metrics: Partial<SearchMetrics>;
  stopReason: string | null;
  limitations: string[];
  parseNote: string | null;
  usedAi: boolean;
  aiEnabled: boolean;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export async function loadSearchView(db: Db, id: string): Promise<SearchView | null> {
  const { data: s } = await db.from("network_searches").select("*").eq("id", id).maybeSingle();
  if (!s) return null;
  const state = (s.state ?? {}) as SearchState;
  const stage = (STAGES as readonly string[]).includes(s.stage) ? (s.stage as Stage) : "understanding";
  return {
    id: s.id,
    query: s.original_query,
    status: s.status,
    stage,
    stageIndex: STAGES.indexOf(stage),
    targetCount: s.target_count,
    criteria: s.criteria ? (NetworkingCriteria.safeParse(s.criteria).data ?? null) : null,
    counters: (s.counters ?? {}) as Partial<SearchCounters>,
    metrics: (s.metrics ?? {}) as Partial<SearchMetrics>,
    stopReason: state.stopReason ? STOP_LABELS[state.stopReason] : null,
    limitations: state.limitations ?? [],
    parseNote: state.parseNote ?? null,
    usedAi: Boolean(state.usedAi),
    aiEnabled: state.aiEnabled ?? true,
    error: s.error,
    createdAt: s.created_at,
    finishedAt: s.finished_at,
  };
}
