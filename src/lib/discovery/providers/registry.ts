import { defaultLLM } from "@/lib/ai/default-llm";
import { discoveryFixturesEnabled } from "@/lib/runtime-mode";
import { HttpPageFetcher, type PageFetcher } from "../fetch-page";
import { FixtureGitHubProvider, FixtureLLM, FixtureOrcidProvider, FixturePageFetcher, FixtureWebProvider } from "../fixtures";
import type { LLMProvider } from "../llm";
import { BraveSearchProvider } from "./brave";
import { GitHubSearchProvider } from "./github";
import { OrcidSearchProvider } from "./orcid";
import { TavilySearchProvider } from "./tavily";
import type { SearchProvider } from "./types";

export type DiscoveryServices = {
  providers: SearchProvider[];
  fetcher: PageFetcher;
  llm: LLMProvider & { usage?: { calls: number; inputTokens: number; outputTokens: number } };
  /** What isn't available, for the UI to explain. */
  limitations: string[];
  fixtures: boolean;
};

/** Picks providers from the server environment. Keys never reach the browser. */
export function discoveryServices(): DiscoveryServices {
  if (discoveryFixturesEnabled()) {
    return { providers: [new FixtureWebProvider(), new FixtureGitHubProvider(), new FixtureOrcidProvider()], fetcher: new FixturePageFetcher(), llm: new FixtureLLM(), limitations: [], fixtures: true };
  }
  const providers: SearchProvider[] = [];
  const limitations: string[] = [];
  // Public web search needs a key. Tavily has a free plan (1,000 searches a month, no card); Brave now needs a card.
  if (process.env.TAVILY_API_KEY) providers.push(new TavilySearchProvider(process.env.TAVILY_API_KEY));
  else if (process.env.BRAVE_SEARCH_API_KEY) providers.push(new BraveSearchProvider(process.env.BRAVE_SEARCH_API_KEY));
  else limitations.push("Web search is off: set TAVILY_API_KEY (free, no card) to also search public websites. GitHub and ORCID profiles are searched without any key.");
  // Keyless public sources: they need no account and no AI to read.
  providers.push(new GitHubSearchProvider(process.env.GITHUB_TOKEN || undefined));
  providers.push(new OrcidSearchProvider());
  if (!process.env.GITHUB_TOKEN) limitations.push("GitHub allows only 60 profile lookups an hour without a token. A free GitHub token (no permissions needed) in GITHUB_TOKEN raises that to 5,000.");
  const llm = defaultLLM();
  if (!llm.enabled) limitations.push("AI is off: requests are understood with the built-in parser and matches are explained by their score breakdown. Set GEMINI_API_KEY (free from Google AI Studio) to also read web pages and get written explanations.");
  return { providers, fetcher: new HttpPageFetcher(), llm, limitations, fixtures: false };
}

export function discoveryStatus() {
  const s = discoveryServices();
  return { providers: s.providers.map((p) => p.name), limitations: s.limitations, aiEnabled: s.llm.enabled };
}
