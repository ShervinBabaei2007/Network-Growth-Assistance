import "server-only";
import { AnthropicLLM, disabledLLM, type LLMProvider } from "@/lib/discovery/llm";
import { GeminiLLM, looksLikeGeminiKey } from "./gemini-provider";

/**
 * Which model service the server uses. Gemini is the default (it has a free tier):
 * GEMINI_API_KEY first. Anthropic stays as an optional alternative when only
 * ANTHROPIC_API_KEY is set. With neither, AI is off and every feature uses its non-AI path.
 */
export function defaultLLM(env: Record<string, string | undefined> = process.env): LLMProvider {
  if (env.GEMINI_API_KEY) return new GeminiLLM(env.GEMINI_API_KEY);
  if (env.ANTHROPIC_API_KEY) return new AnthropicLLM(env.ANTHROPIC_API_KEY);
  return disabledLLM;
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
  if (llm instanceof GeminiLLM) return "gemini";
  if (llm instanceof AnthropicLLM) return "anthropic";
  return null;
}
