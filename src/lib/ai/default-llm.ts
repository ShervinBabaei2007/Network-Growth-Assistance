import "server-only";
import { AnthropicLLM, disabledLLM, type LLMProvider } from "@/lib/discovery/llm";
import { FallbackLLM, type ChainEntry } from "./fallback-llm";
import { GeminiLLM, geminiModels, looksLikeGeminiKey } from "./gemini-provider";
import { COMPAT_SERVICES, OpenAICompatLLM } from "./openai-compat-provider";

/**
 * Which model services the server uses, in this order: every Gemini model in GEMINI_MODELS (each has its own free
 * quota), then Groq, Mistral and OpenRouter when their keys are set (all have free plans), then Anthropic. A call goes
 * to the first one with quota left and moves on when one runs out, so free capacity adds up. With none configured,
 * AI is off and every feature uses its non-AI path.
 */
export function defaultLLM(env: Record<string, string | undefined> = process.env): LLMProvider {
  const entries: ChainEntry[] = [];
  if (env.GEMINI_API_KEY) {
    // Lite models read bulk pages; the full Flash is kept for understanding the request and ranking.
    for (const model of geminiModels(env)) entries.push({ name: `gemini:${model}`, llm: new GeminiLLM(env.GEMINI_API_KEY, { model }), prefer: [/lite/i.test(model) ? "fast" : "smart"] });
  }
  const compat = (key: "groq" | "mistral" | "openrouter", apiKey: string | undefined, model: string | undefined, prefer: ChainEntry["prefer"]) => {
    if (apiKey) entries.push({ name: key, llm: new OpenAICompatLLM({ ...COMPAT_SERVICES[key], apiKey, model: model?.trim() || COMPAT_SERVICES[key].model }), prefer });
  };
  compat("groq", env.GROQ_API_KEY, env.GROQ_MODEL, ["fast"]);
  compat("mistral", env.MISTRAL_API_KEY, env.MISTRAL_MODEL, ["smart"]);
  compat("openrouter", env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL, undefined);
  if (env.ANTHROPIC_API_KEY) entries.push({ name: "anthropic", llm: new AnthropicLLM(env.ANTHROPIC_API_KEY) });
  if (!entries.length) return disabledLLM;
  return entries.length === 1 ? entries[0].llm : new FallbackLLM(entries);
}

export type AiVendor = "gemini" | "anthropic";
export const AI_VENDOR_LABELS: Record<AiVendor, string> = { gemini: "Google Gemini", anthropic: "Anthropic Claude" };

/** Which vendor a user's own key is for, from its shape: "AIza…" or "AQ.…" is Gemini, "sk-ant-…" is Anthropic. */
export function keyVendor(key: string): AiVendor | null {
  if (looksLikeGeminiKey(key)) return "gemini";
  if (/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim())) return "anthropic";
  return null;
}

/** The model service for a user's own key, or null when the key isn't one we recognise. */
export function llmForKey(key: string): LLMProvider | null {
  const vendor = keyVendor(key);
  if (vendor === "gemini") return new GeminiLLM(key.trim());
  if (vendor === "anthropic") return new AnthropicLLM(key.trim());
  return null;
}

/** The vendor behind a model service, for labels; null when AI is off or it's a test stand-in. */
export function vendorOf(llm: LLMProvider): AiVendor | null {
  if (llm instanceof FallbackLLM) {
    const first = llm.first();
    return first ? vendorOf(first) : null;
  }
  if (llm instanceof GeminiLLM) return "gemini";
  if (llm instanceof AnthropicLLM) return "anthropic";
  return null;
}
