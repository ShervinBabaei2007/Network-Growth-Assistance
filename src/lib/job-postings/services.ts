import { AnthropicLLM, type LLMProvider } from "@/lib/discovery/llm";
import { disabledEmbedder, EdgeEmbedder, type Embedder } from "./embeddings";
import { FixtureEmbedder, FixtureJobsLLM } from "./fixtures";

export type JobServices = {
  embedder: Embedder;
  /** The operator's AI key (optional extra; users can bring their own). */
  operatorLlm: LLMProvider;
  fixtures: boolean;
  /** What isn't available, for the UI to explain. */
  limitations: string[];
};

/** Postings and fit checks need no keys. Embeddings and AI are optional upgrades. */
export function jobServices(): JobServices {
  if (process.env.JOBS_FIXTURES === "1") {
    return { embedder: new FixtureEmbedder(), operatorLlm: new FixtureJobsLLM(), fixtures: true, limitations: ["Showing fictional sample employers (JOBS_FIXTURES=1)."] };
  }
  const limitations: string[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.EMBED_SECRET;
  const embedder = url && key && secret ? new EdgeEmbedder(`${url}/functions/v1/embed`, secret, key) : disabledEmbedder;
  if (!embedder.enabled) limitations.push("Meaning-based matching is off (set EMBED_SECRET and deploy the embed function); fit checks use the skills list only.");
  return { embedder, operatorLlm: new AnthropicLLM(), fixtures: false, limitations };
}
