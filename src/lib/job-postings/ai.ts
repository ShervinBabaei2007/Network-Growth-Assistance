import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicLLM, type LLMProvider } from "@/lib/discovery/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "./service";
import { jobServices } from "./services";

/**
 * Optional AI rewriting. A user's own Anthropic key is used first (encrypted at rest
 * with APP_ENCRYPTION_KEY, decrypted only on the server per request). Otherwise the
 * operator's key, within a daily per-user quota. Everything else in Jobs works without AI.
 */

export const DEFAULT_DAILY_QUOTA = 3;
export const dailyQuota = () => Math.max(0, Number(process.env.AI_DAILY_QUOTA ?? DEFAULT_DAILY_QUOTA) || 0);

function keyBytes(): Buffer | null {
  const secret = process.env.APP_ENCRYPTION_KEY;
  return secret && secret.length >= 32 ? createHash("sha256").update(secret).digest() : null;
}

export const canStoreKeys = () => keyBytes() !== null;

/** AES-256-GCM: "v1:<iv>:<tag>:<ciphertext>", base64. */
export function encryptSecret(plain: string): string {
  const key = keyBytes();
  if (!key) throw new Error("APP_ENCRYPTION_KEY is not set.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string | null {
  const key = keyBytes();
  const [v, iv, tag, data] = stored.split(":");
  if (!key || v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Checks a key with a free call (listing models). */
export async function validateAnthropicKey(key: string): Promise<boolean> {
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return false;
  if (process.env.JOBS_FIXTURES === "1") return true;
  try {
    await new Anthropic({ apiKey: key, timeout: 10_000, maxRetries: 0 }).models.list({ limit: 1 });
    return true;
  } catch {
    return false;
  }
}

export type AiAccess =
  | { ok: true; llm: LLMProvider; source: "own" | "operator"; remaining: number | null }
  | { ok: false; reason: string };

/** Whether this user can use AI right now, and with which key. Doesn't consume quota. */
export async function aiAccess(db: Db): Promise<AiAccess> {
  const { data: mine } = await db.from("user_ai").select("own_key_ciphertext").maybeSingle();
  if (mine?.own_key_ciphertext) {
    const key = decryptSecret(mine.own_key_ciphertext);
    if (key) return { ok: true, llm: new AnthropicLLM(key), source: "own", remaining: null };
  }
  const operator = jobServices().operatorLlm;
  const quota = dailyQuota();
  if (!operator.enabled || quota === 0) return { ok: false, reason: "AI rewriting needs your own Anthropic API key. Add it in Settings." };
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await db.from("ai_usage").select("used").eq("day", today).maybeSingle();
  const remaining = quota - (usage?.used ?? 0);
  if (remaining <= 0) return { ok: false, reason: `You've used today's ${quota} AI rewrites. Add your own Anthropic API key in Settings for more, or use the free tailoring.` };
  return { ok: true, llm: operator, source: "operator", remaining };
}

/** Counts one operator-key use. Server-only (the table can't be written by users). */
export async function consumeQuota(userId: string): Promise<boolean> {
  const { data } = await createAdminClient().rpc("consume_ai_quota", { p_user: userId, p_limit: dailyQuota() });
  return data === true;
}
