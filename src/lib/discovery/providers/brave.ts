import { ProviderError, type SearchProvider, type SearchResult } from "./types";
import { BODY_LIMITS, readCappedJson } from "@/lib/net/read-capped";

type BraveResponse = {
  web?: { results?: { url?: string; title?: string; description?: string; extra_snippets?: string[] }[] };
};

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'");

/** Brave Search API (web results). https://api.search.brave.com/app/documentation/web-search */
export class BraveSearchProvider implements SearchProvider {
  readonly id = "web" as const;
  readonly name = "Brave Search";

  constructor(private readonly apiKey: string) {}

  async search(query: string, { count = 15, signal }: { count?: number; signal?: AbortSignal } = {}): Promise<SearchResult[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(20, count)));
    url.searchParams.set("safesearch", "moderate");
    url.searchParams.set("extra_snippets", "true");
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
        signal: signal ?? AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch {
      throw new ProviderError(this.name, "Couldn't reach Brave Search.", true);
    }
    if (res.status === 429) throw new ProviderError(this.name, "Brave Search rate limit reached.", true);
    if (res.status === 401 || res.status === 403) throw new ProviderError(this.name, "The Brave Search API key was rejected.");
    if (!res.ok) throw new ProviderError(this.name, `Brave Search returned ${res.status}.`, res.status >= 500);
    const body = await readCappedJson<BraveResponse>(res, BODY_LIMITS.api).catch(() => {
      throw new ProviderError(this.name, "Brave Search sent an answer that couldn't be read.", true);
    });
    return (body.web?.results ?? [])
      .filter((r) => r.url && r.title)
      .map((r, i) => ({
        provider: "brave",
        url: r.url!,
        title: stripTags(r.title!),
        snippet: stripTags([r.description ?? "", ...(r.extra_snippets ?? [])].join(" … ")).slice(0, 2000),
        rank: i + 1,
      }));
  }
}
