import "server-only";
import { aiAccess, consumeQuota, type AiUnavailableCode } from "@/lib/job-postings/ai";
import type { Db } from "@/lib/job-postings/service";
import type { LLMProvider } from "@/lib/discovery/llm";
import { AI_VENDOR_LABELS } from "./default-llm";
import { LlmAIProvider } from "./llm-ai-provider";
import type { AIProvider } from "./provider";

export type { AIProvider } from "./provider";

export type AiSession =
  | {
      ok: true;
      provider: AIProvider;
      source: "own" | "operator";
      /** Which service runs it (for labels); null for the test stand-in. */
      vendor: "gemini" | "anthropic" | null;
      /** Free uses left today on the server's key (null with the user's own key). */
      remaining: number | null;
      /** Counts one use of the server's key before an AI operation. False when the day's limit is reached. */
      charge: () => Promise<boolean>;
    }
  | { ok: false; code: AiUnavailableCode; reason: string };

/**
 * The AI provider for this user right now: their own key first, otherwise the server's
 * key within the daily allowance. Keys stay on the server. Adding a vendor means adding
 * an AIProvider implementation here; nothing else changes.
 */
export async function getAIProvider(db: Db, userId: string): Promise<AiSession> {
  const access = await aiAccess(db);
  if (!access.ok) return access;
  return {
    ok: true,
    provider: new LlmAIProvider(access.llm, access.vendor ? AI_VENDOR_LABELS[access.vendor] : "AI"),
    source: access.source,
    vendor: access.vendor,
    remaining: access.remaining,
    charge: async () => (access.source === "own" ? true : consumeQuota(userId)),
  };
}

/**
 * The model itself, for features with their own prompts (connection notes, intros). Same
 * rules as getAIProvider: the user's own key first, otherwise the server's key, and each
 * use of the server's key must be charged against the daily allowance first.
 */
export async function getUserLLM(db: Db, userId: string): Promise<{ ok: true; llm: LLMProvider; charge: () => Promise<boolean> } | { ok: false; code: AiUnavailableCode; reason: string }> {
  const access = await aiAccess(db);
  if (!access.ok) return access;
  return { ok: true, llm: access.llm, charge: async () => (access.source === "own" ? true : consumeQuota(userId)) };
}
