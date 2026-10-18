import { afterEach, describe, expect, it, vi } from "vitest";
import { TavilySearchProvider } from "./tavily";

const reply = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("Tavily provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns results in order and drops LinkedIn", async () => {
    reply({ results: [{ url: "https://example.dev/ada", title: "Ada", content: "Software engineer" }, { url: "https://www.linkedin.com/in/ada", title: "Ada", content: "x" }] });
    const r = await new TavilySearchProvider("k").search("ada");
    expect(r.map((x) => x.url)).toEqual(["https://example.dev/ada"]);
    expect(r[0]).toMatchObject({ provider: "tavily", rank: 1, snippet: "Software engineer" });
  });

  it("asks Tavily to leave LinkedIn out and keeps the key in a header", async () => {
    reply({ results: [] });
    await new TavilySearchProvider("secret").search("q");
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).exclude_domains).toContain("linkedin.com");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(String(init.body)).not.toContain("secret");
  });

  it("explains a rejected key and a reached limit", async () => {
    reply({}, 401);
    await expect(new TavilySearchProvider("k").search("q")).rejects.toThrow(/rejected/);
    reply({}, 429);
    await expect(new TavilySearchProvider("k").search("q")).rejects.toMatchObject({ retryable: true });
  });
});
