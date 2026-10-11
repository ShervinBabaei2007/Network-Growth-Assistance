import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * The only door to a language model in discovery. Callers pass a Zod schema and
 * get validated data back, never free text, so no stage parses prose.
 *
 * - "fast" is the cheap model, used for bulk extraction from public pages.
 * - "smart" is the strong model, used once per search to understand the request
 *   and for the final reranking and explanations.
 */
export type LlmTier = "fast" | "smart";
export type LlmResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface LLMProvider {
  readonly enabled: boolean;
  structured<S extends z.ZodType>(opts: { tier: LlmTier; system: string; user: string; schema: S; maxTokens?: number }): Promise<LlmResult<z.infer<S>>>;
}

/** Counts calls and tokens so a search can enforce its LLM budget and report cost. */
export type LlmUsage = { calls: number; inputTokens: number; outputTokens: number };

export const MODELS: Record<LlmTier, string> = {
  fast: "claude-haiku-4-5",
  smart: "claude-opus-5-5",
};

export class AnthropicLLM implements LLMProvider {
  readonly enabled = Boolean(process.env.ANTHROPIC_API_KEY);
  readonly usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  private client: Anthropic | null = null;

  async structured<S extends z.ZodType>({ tier, system, user, schema, maxTokens = 8000 }: { tier: LlmTier; system: string; user: string; schema: S; maxTokens?: number }): Promise<LlmResult<z.infer<S>>> {
    if (!this.enabled) return { ok: false, reason: "AI isn't configured on this server." };
    // Research steps must finish within the route limit (60 s), so calls are capped and retried once.
    this.client ??= new Anthropic({ timeout: 40_000, maxRetries: 1 });
    this.usage.calls++;
    try {
      const format = betaZodOutputFormat(schema);
      const response =
        tier === "smart"
          ? await this.client.beta.messages.parse({
              model: MODELS.smart,
              max_tokens: maxTokens,
              // Understanding a request and explaining matches are short, well-specified tasks.
              output_config: { effort: "low", format },
              // If the model declines for a policy reason, the API retries on a fallback model.
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              system,
              messages: [{ role: "user", content: user }],
            })
          : await this.client.beta.messages.parse({
              model: MODELS.fast,
              max_tokens: maxTokens,
              output_config: { format },
              system,
              messages: [{ role: "user", content: user }],
            });
      this.usage.inputTokens += response.usage.input_tokens;
      this.usage.outputTokens += response.usage.output_tokens;
      if (response.stop_reason === "refusal") return { ok: false, reason: "The model declined this request." };
      if (response.stop_reason === "max_tokens") return { ok: false, reason: "The model's answer was cut off." };
      if (response.parsed_output == null) return { ok: false, reason: "The model's answer didn't match the expected format." };
      // Validate again on our side; the schema may carry checks JSON Schema can't express.
      const checked = schema.safeParse(response.parsed_output);
      if (!checked.success) return { ok: false, reason: "The model's answer failed validation." };
      return { ok: true, data: checked.data };
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: "The AI service is busy right now." };
      if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: "The server's Anthropic API key was rejected." };
      if (e instanceof Anthropic.APIError) return { ok: false, reason: `The AI service returned an error (${e.status ?? "network"}).` };
      return { ok: false, reason: "Couldn't reach the AI service." };
    }
  }
}

/** A provider that always declines; deterministic code paths take over. */
export const disabledLLM: LLMProvider = {
  enabled: false,
  async structured() {
    return { ok: false, reason: "AI is disabled." };
  },
};
