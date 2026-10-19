import "server-only";
import { defaultLLM, llmForKey } from "@/lib/ai/default-llm";
import { discoveryAiSearchesPerDay } from "@/lib/env";
import { decryptSecret } from "@/lib/job-postings/ai";
import { disabledLLM, type LLMProvider } from "./llm";
import type { Db } from "./store";

export type DiscoveryAi = { llm: LLMProvider; source: "own" | "shared" | "limit" | "off" };

/**
 * Which AI reads and explains a Discover search. The person's own key comes first (no limit: it is their quota); otherwise the
 * server's free services, up to a few AI-assisted searches a day each so one visitor cannot use up everyone's share. Past
 * that, or with no AI configured, the search still runs on the evidence rules alone.
 */
export async function discoveryAi(db: Db, searchId: string | null): Promise<DiscoveryAi> {
  const { data: mine } = await db.from("user_ai").select("own_key_ciphertext").maybeSingle();
  if (mine?.own_key_ciphertext) {
    const key = decryptSecret(mine.own_key_ciphertext);
    const llm = key ? llmForKey(key) : null;
    if (llm) return { llm, source: "own" };
  }
  const shared = defaultLLM();
  if (!shared.enabled) return { llm: disabledLLM, source: "off" };
  const limit = discoveryAiSearchesPerDay();
  if (limit === 0) return { llm: disabledLLM, source: "limit" };
  // Searches today that already used AI, not counting this one (it is allowed to continue).
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  let q = db.from("network_searches").select("id", { count: "exact", head: true }).gte("created_at", dayStart.toISOString()).neq("metrics->>llmCalls", "0").not("metrics->>llmCalls", "is", null);
  if (searchId) q = q.neq("id", searchId);
  const { count } = await q;
  return (count ?? 0) >= limit ? { llm: disabledLLM, source: "limit" } : { llm: shared, source: "shared" };
}
