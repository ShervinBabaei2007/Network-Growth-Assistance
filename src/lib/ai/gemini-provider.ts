import "server-only";
import { z } from "zod";
import type { LLMProvider, LlmResult, LlmTier, LlmUsage } from "@/lib/discovery/llm";
import { BODY_LIMITS, readCappedJson, readCappedText } from "@/lib/net/read-capped";

/**
 * Google's Gemini Developer API (https://ai.google.dev), the app's default model service:
 * it has a free tier, so AI features work without paying for an API. Called with plain
 * fetch on the official REST endpoint; no SDK.
 *
 * - Every call asks for JSON matching the caller's Zod schema (structured output), then
 *   validates the answer again here. Anything malformed is rejected, never partly used.
 * - The key travels only in the x-goog-api-key header from the server; it is never put
 *   in a URL, a log line or anything sent to the browser.
 * - Failures (rate limit or exhausted free quota, rejected key, outage, timeout, a blocked
 *   or cut-off answer) come back as { ok: false } with a plain reason. Callers then use
 *   their non-AI path (Improvement Notes, the template letter, the rule-based parser).
 */

/** A current Flash model on the free tier with structured output. Override with GEMINI_MODEL. */
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
const API = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 40_000;

/** How long Google says to wait, from a 429 body: a RetryInfo "retryDelay":"84400s", or "retry in 23h27m32s". Null if it doesn't say. */
export function retryAfterFrom(body: string): number | undefined {
  const sec = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (sec) return Math.round(Number(sec[1]) * 1000);
  const words = body.match(/retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i);
  if (words && (words[1] || words[2] || words[3])) return Math.round(((Number(words[1] ?? 0) * 60 + Number(words[2] ?? 0)) * 60 + Number(words[3] ?? 0)) * 1000);
  return undefined;
}

/** Models tried in this order. Each Gemini model has its own free quota, so a lite model first (bulk reading) and the full Flash after. */
export const GEMINI_DEFAULT_MODELS = ["gemini-flash-lite-latest", GEMINI_DEFAULT_MODEL];
const MODEL_NAME = /^[a-z0-9][a-z0-9.\-]{1,80}$/i;

/** The models to chain: GEMINI_MODELS (comma list), else GEMINI_MODEL alone, else the defaults. Invalid names are dropped. */
export function geminiModels(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env.GEMINI_MODELS ?? "").split(",").map((m) => m.trim().replace(/^models\//, "")).filter((m) => MODEL_NAME.test(m));
  if (list.length) return [...new Set(list)];
  if (env.GEMINI_MODEL?.trim()) return [geminiModel(env)];
  return GEMINI_DEFAULT_MODELS;
}

/** The model to use: GEMINI_MODEL, or the default. The only place a Gemini model name is chosen. */
export function geminiModel(env: Record<string, string | undefined> = process.env): string {
  const m = env.GEMINI_MODEL?.trim().replace(/^models\//, "");
  return m && /^[a-z0-9][a-z0-9.\-]{1,80}$/i.test(m) ? m : GEMINI_DEFAULT_MODEL;
}

/** Google AI Studio keys look like "AIza…" (39 characters) or, in Google's newer format, "AQ.…". */
export const looksLikeGeminiKey = (key: string) => /^(AIza[0-9A-Za-z_-]{30,}|AQ\.[0-9A-Za-z_-]{30,})$/.test(key.trim());

/** JSON Schema keywords Gemini's structured output accepts; the rest are dropped (Zod still checks them). */
const KEEP = new Set(["type", "properties", "required", "items", "prefixItems", "enum", "anyOf", "description", "title", "additionalProperties", "minItems", "maxItems", "minimum", "maximum", "format", "$ref", "$defs", "propertyOrdering"]);

/** The Zod schema as JSON Schema in the subset Gemini supports. Exported for tests. */
export function geminiSchema(schema: z.ZodType): unknown {
  const prune = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(prune);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "const") out.enum = [v];
      else if (k === "properties" || k === "$defs") out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([name, sub]) => [name, prune(sub)]));
      else if (KEEP.has(k)) out[k] = prune(v);
    }
    return out;
  };
  return prune(z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }));
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

const BLOCKED = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "LANGUAGE"]);

export class GeminiLLM implements LLMProvider {
  readonly enabled: boolean;
  readonly usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelaysMs: number[];

  /** Uses the server's GEMINI_API_KEY, or a user's own key when given. */
  constructor(
    private readonly apiKey: string | undefined = process.env.GEMINI_API_KEY || undefined,
    opts: { model?: string; fetchImpl?: typeof fetch; retryDelaysMs?: number[] } = {},
  ) {
    this.enabled = Boolean(apiKey);
    this.model = opts.model ?? geminiModel();
    this.fetchImpl = opts.fetchImpl ?? fetch;
    // The free tier answers 503 ("overloaded") now and then; it usually clears within a few seconds.
    this.retryDelaysMs = opts.retryDelaysMs ?? [800, 2500];
  }

  async structured<S extends z.ZodType>({ system, user, schema, maxTokens = 8000 }: { tier: LlmTier; system: string; user: string; schema: S; maxTokens?: number }): Promise<LlmResult<z.infer<S>>> {
    if (!this.enabled || !this.apiKey) return { ok: false, reason: "AI isn't configured on this server." };
    this.usage.calls++;
    const send = () =>
      this.fetchImpl(`${API}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: geminiSchema(schema),
            // Thinking models spend part of the output budget before answering: leave room for both.
            maxOutputTokens: Math.max(maxTokens, 4000) * 2,
            temperature: 0.2,
          },
        }),
      });
    let res: Response;
    try {
      res = await send();
      for (const delay of this.retryDelaysMs) {
        if (![500, 502, 503, 504].includes(res.status)) break;
        await new Promise((r) => setTimeout(r, delay));
        res = await send();
      }
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return { ok: false, reason: "The AI service took too long to answer.", kind: "timeout" };
      return { ok: false, reason: "Couldn't reach the AI service.", kind: "busy" };
    }
    if (res.status === 429) {
      const text = await readCappedText(res, BODY_LIMITS.ai).catch(() => "");
      return { ok: false, reason: "The AI service's free limit is used up or it's busy right now. Try again later.", kind: "quota", retryAfterMs: retryAfterFrom(text) };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "The Gemini API key was rejected." };
    if (res.status === 400) {
      // Google reports an invalid key as 400 INVALID_ARGUMENT with API_KEY_INVALID.
      const text = await readCappedText(res, BODY_LIMITS.ai).catch(() => "");
      if (/API_KEY_INVALID|API key not valid/i.test(text)) return { ok: false, reason: "The Gemini API key was rejected." };
      return { ok: false, reason: "The AI service couldn't handle this request (400)." };
    }
    if (!res.ok) return { ok: false, reason: `The AI service returned an error (${res.status}).`, kind: res.status >= 500 ? "busy" : "other" };

    const body = (await readCappedJson<GeminiResponse>(res, BODY_LIMITS.ai).catch(() => null));
    if (!body) return { ok: false, reason: "The model's answer didn't match the expected format." };
    this.usage.inputTokens += body.usageMetadata?.promptTokenCount ?? 0;
    this.usage.outputTokens += (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0);
    if (body.promptFeedback?.blockReason) return { ok: false, reason: "The model declined this request." };
    const candidate = body.candidates?.[0];
    const finish = candidate?.finishReason ?? "";
    if (BLOCKED.has(finish)) return { ok: false, reason: "The model declined this request." };
    if (finish === "MAX_TOKENS") return { ok: false, reason: "The model's answer was cut off." };
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();
    if (!text) return { ok: false, reason: "The model returned no answer." };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      return { ok: false, reason: "The model's answer didn't match the expected format." };
    }
    const checked = schema.safeParse(parsed);
    if (!checked.success) return { ok: false, reason: "The model's answer failed validation." };
    return { ok: true, data: checked.data };
  }
}

/** Checks a Gemini key with a free call (reading the configured model's details). */
export async function validateGeminiKey(key: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!looksLikeGeminiKey(key)) return false;
  try {
    const res = await fetchImpl(`${API}/models/${encodeURIComponent(geminiModel())}`, { headers: { "x-goog-api-key": key.trim() }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
