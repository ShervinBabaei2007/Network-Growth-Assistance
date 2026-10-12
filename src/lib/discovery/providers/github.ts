import { ProviderError, type GitHubProfile, type SearchProvider, type SearchResult } from "./types";
import { BODY_LIMITS, readCappedJson, readCappedText } from "@/lib/net/read-capped";

type UserSearch = { items?: { login: string }[] };
type User = { login: string; name: string | null; bio: string | null; company: string | null; location: string | null; blog: string | null; html_url: string; type: string };

/**
 * GitHub's public REST API: user search, then each user's public profile fields.
 * Those fields (name, bio, company, location, blog) are evidence without any page fetch.
 */
export class GitHubSearchProvider implements SearchProvider {
  readonly id = "github" as const;
  readonly name = "GitHub";

  constructor(private readonly token?: string) {}

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`https://api.github.com${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "network-growth-assistant",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        signal: signal ?? AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch {
      throw new ProviderError(this.name, "Couldn't reach GitHub.", true);
    }
    if (res.status === 403 || res.status === 429) throw new ProviderError(this.name, "GitHub rate limit reached.", true);
    if (!res.ok) throw new ProviderError(this.name, `GitHub returned ${res.status}.`, res.status >= 500);
    return readCappedJson<T>(res, BODY_LIMITS.api).catch(() => {
      throw new ProviderError(this.name, "GitHub sent an answer that couldn't be read.", true);
    });
  }

  async search(query: string, { count = 8, signal }: { count?: number; signal?: AbortSignal } = {}): Promise<SearchResult[]> {
    const found = await this.get<UserSearch>(`/search/users?q=${encodeURIComponent(`${query} type:user`)}&per_page=${Math.min(count, 15)}`, signal);
    const logins = (found.items ?? []).map((i) => i.login).slice(0, count);
    const users = await Promise.all(logins.map((l) => this.get<User>(`/users/${encodeURIComponent(l)}`, signal).catch(() => null)));
    return users
      .filter((u): u is User => u !== null && u.type === "User")
      .map((u, i) => {
        const profile: GitHubProfile = { login: u.login, name: u.name, bio: u.bio, company: u.company, location: u.location, blog: u.blog, htmlUrl: u.html_url };
        return {
          provider: "github",
          url: u.html_url,
          title: u.name ? `${u.name} (${u.login})` : u.login,
          snippet: [u.bio, u.company, u.location].filter(Boolean).join(" · "),
          rank: i + 1,
          structured: profile,
        };
      });
  }

  /** Links the person published under "Social accounts" on their profile (may include LinkedIn). */
  async socialLinks(login: string, signal?: AbortSignal): Promise<string[]> {
    const accounts = await this.get<{ provider: string; url: string }[]>(`/users/${encodeURIComponent(login)}/social_accounts`, signal).catch(() => []);
    return accounts.map((a) => a.url).filter((u) => /^https?:\/\//.test(u));
  }

  /** The person's profile README (the repository named after them), as Markdown, or null. */
  async profileReadme(login: string, signal?: AbortSignal): Promise<string | null> {
    const l = encodeURIComponent(login);
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${l}/${l}/HEAD/README.md`, { signal: signal ?? AbortSignal.timeout(8_000), cache: "no-store" });
      if (!res.ok) return null;
      return (await readCappedText(res, 200_000)).slice(0, 40_000);
    } catch {
      return null;
    }
  }
}

/** What the verification step needs from a GitHub source. */
export interface GitHubProfileSource {
  socialLinks(login: string): Promise<string[]>;
  profileReadme(login: string): Promise<string | null>;
}
