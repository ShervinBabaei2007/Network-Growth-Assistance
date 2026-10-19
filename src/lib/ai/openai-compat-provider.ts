import "server-only";
import { z } from "zod";
import type { LLMProvider, LlmResult, LlmTier, LlmUsage } from "@/lib/discovery/llm";
import { BODY_LIMITS, readCappedJson, readCappedText } from "@/lib/net/read-capped";

/**
 * Any service that speaks the OpenAI "chat completions" format: Groq, Mistral and OpenRouter all have free plans.
 * Like the Gemini provider, every call asks for a JSON object, validates it against the caller's Zod schema, and returns
 * { ok: false } with a plain reason otherwise. One repair attempt is made when the first answer is not valid.
 */

export type CompatConfig = { name: string; baseUrl: string; apiKey: string; model: string };

type ChatResponse = { choices?: { message?: { content?: string | null }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };

const TIMEOUT_MS = 40_000;

/** Milliseconds from a Retry-After header (seconds) or a "try again in 1m20s" message; undefined if neither says. */
export function retryAfterMs(header: string | null, body: string): number | undefined {
  const n = Number(header);
  if (header && Number.isFinite(n) && n > 0) return Math.round(n * 1000);
  const m = body.match(/try again in\s+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i);
  if (m && (m[1] || m[2] || m[3])) return Math.round(((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000);
  return undefined;
}

type Failure = Extract<LlmResult<never>, { ok: false }>;

export class OpenAICompatLLM implements LLMProvider {
  readonly enabled: boolean;
  readonly usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };

  constructor(
    private readonly cfg: CompatConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.enabled = Boolean(cfg.apiKey);
  }

  private async ask(messages: { role: string; content: string }[], maxTokens: number): Promise<{ ok: true; text: string } | { ok: false; res: Failure }> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.baseUrl}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({ model: this.cfg.model, messages, temperature: 0.2, max_tokens: Math.min(maxTokens, 8000), response_format: { type: "json_object" } }),
      });
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return { ok: false, res: { ok: false, reason: "The AI service took too long to answer.", kind: "timeout" } };
      return { ok: false, res: { ok: false, reason: "Couldn't reach the AI service.", kind: "busy" } };
    }
    if (res.status === 429) {
      const text = await readCappedText(res, BODY_LIMITS.ai).catch(() => "");
      return { ok: false, res: { ok: false, reason: `${this.cfg.name}'s free limit is used up or it's busy right now.`, kind: "quota", retryAfterMs: retryAfterMs(res.headers.get("retry-after"), text) } };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, res: { ok: false, reason: `The ${this.cfg.name} API key was rejected.`, kind: "other" } };
    if (!res.ok) return { ok: false, res: { ok: false, reason: `The AI service returned an error (${res.status}).`, kind: res.status >= 500 ? "busy" : "other" } };
    const body = await readCappedJson<ChatResponse>(res, BODY_LIMITS.ai).catch(() => null);
    this.usage.inputTokens += body?.usage?.prompt_tokens ?? 0;
    this.usage.outputTokens += body?.usage?.completion_tokens ?? 0;
    const choice = body?.choices?.[0];
    if (!choice?.message?.content) return { ok: false, res: { ok: false, reason: "The model returned no answer.", kind: "other" } };
    if (choice.finish_reason === "length") return { ok: false, res: { ok: false, reason: "The model's answer was cut off.", kind: "other" } };
    return { ok: true, text: choice.message.content };
  }

  async structured<S extends z.ZodType>({ system, user, schema, maxTokens = 8000 }: { tier: LlmTier; system: string; user: string; schema: S; maxTokens?: number }): Promise<LlmResult<z.infer<S>>> {
    if (!this.enabled) return { ok: false, reason: "AI isn't configured on this server." };
    this.usage.calls++;
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }));
    const messages = [
      { role: "system", content: `${system}\n\nReply with only one JSON object that matches this JSON Schema, with no other text:\n${jsonSchema}` },
      { role: "user", content: user },
    ];
    const first = await this.ask(messages, maxTokens);
    if (!first.ok) return first.res;
    const check = (text: string) => {
      try {
        const parsed = schema.safeParse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")));
        return parsed.success ? { ok: true as const, data: parsed.data } : { ok: false as const, why: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
      } catch {
        return { ok: false as const, why: "not valid JSON" };
      }
    };
    const a = check(first.text);
    if (a.ok) return { ok: true, data: a.data };
    // One repair attempt, telling the model what was wrong.
    const second = await this.ask([...messages, { role: "assistant", content: first.text.slice(0, 4000) }, { role: "user", content: `That reply was rejected (${a.why}). Reply again with only the corrected JSON object.` }], maxTokens);
    if (!second.ok) return second.res;
    const b = check(second.text);
    return b.ok ? { ok: true, data: b.data } : { ok: false, reason: "The model's answer failed validation.", kind: "other" };
  }
}

/** Free-plan endpoints and starting models. Override the model with GROQ_MODEL / MISTRAL_MODEL / OPENROUTER_MODEL. */
export const COMPAT_SERVICES = {
  groq: { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  mistral: { name: "Mistral", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-oss-120b:free" },
} as const;
