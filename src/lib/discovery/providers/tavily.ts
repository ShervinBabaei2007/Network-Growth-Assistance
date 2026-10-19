import { ProviderError, type SearchProvider, type SearchResult } from "./types";
import { BODY_LIMITS, readCappedJson } from "@/lib/net/read-capped";

type TavilyResponse = { results?: { url?: string; title?: string; content?: string }[] };

/** Tavily's search API (https://docs.tavily.com). Its free plan is 1,000 searches a month with no card. */
export class TavilySearchProvider implements SearchProvider {
  readonly id = "web" as const;
  readonly name = "Tavily Search";

  constructor(private readonly apiKey: string) {}

  async search(query: string, { count = 10, signal }: { count?: number; signal?: AbortSignal } = {}): Promise<SearchResult[]> {
    let res: Response;
    try {
      res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        // The planner already puts -site:linkedin.com in the query; the domain list makes sure of it.
        body: JSON.stringify({ query, max_results: Math.min(20, count), search_depth: "basic", exclude_domains: ["linkedin.com", "www.linkedin.com"] }),
        signal: signal ?? AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch {
      throw new ProviderError(this.name, "Couldn't reach Tavily Search.", true);
    }
    if (res.status === 429 || res.status === 432 || res.status === 433) throw new ProviderError(this.name, "Tavily Search limit reached.", true);
    if (res.status === 401 || res.status === 403) throw new ProviderError(this.name, "The Tavily API key was rejected.");
    if (!res.ok) throw new ProviderError(this.name, `Tavily Search returned ${res.status}.`, res.status >= 500);
    const body = await readCappedJson<TavilyResponse>(res, BODY_LIMITS.api).catch(() => {
      throw new ProviderError(this.name, "Tavily Search sent an answer that couldn't be read.", true);
    });
    return (body.results ?? [])
      .filter((r) => r.url && r.title && !/(^|\.)linkedin\.com\b/i.test(new URL(r.url, "https://x.invalid").hostname))
      .map((r, i) => ({ provider: "tavily", url: r.url!, title: r.title!.slice(0, 300), snippet: (r.content ?? "").slice(0, 2000), rank: i + 1 }));
  }
}
