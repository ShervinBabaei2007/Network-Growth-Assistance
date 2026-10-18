import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubSearchProvider, resetGitHubLimits } from "./github";

const user = (login: string) => ({ login, name: login.toUpperCase(), bio: "Software engineer", company: null, location: "Vancouver", blog: null, html_url: `https://github.com/${login}`, type: "User" });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe("GitHub provider", () => {
  beforeEach(() => resetGitHubLimits());
  afterEach(() => vi.unstubAllGlobals());

  it("reads each person's public profile once, even across searches", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return url.includes("/search/users") ? json({ items: [{ login: "ada" }] }) : json(user("ada"));
    });
    const gh = new GitHubSearchProvider();
    expect(await gh.search("a")).toHaveLength(1);
    expect(await gh.search("b")).toHaveLength(1);
    expect(calls.filter((c) => c.includes("/users/ada"))).toHaveLength(1);
  });

  it("says the rate limit was reached instead of returning no results, then stops asking", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      calls++;
      return url.includes("/search/users") ? json({ items: [{ login: "ada" }, { login: "bo" }] }) : json({ message: "limit" }, 403, { "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600) });
    });
    const gh = new GitHubSearchProvider();
    await expect(gh.search("a")).rejects.toThrow(/rate limit/);
    const before = calls;
    await expect(gh.search("b")).rejects.toThrow(/rate limit/);
    expect(calls).toBe(before);
  });
});
