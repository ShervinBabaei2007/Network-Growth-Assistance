import { afterEach, describe, expect, it, vi } from "vitest";
import { isFetchable, isLinkedInUrl } from "./blocklist";
import { htmlToText, HttpPageFetcher, robotsAllows } from "./fetch-page";

describe("blocklist", () => {
  it.each(["https://www.linkedin.com/in/someone", "https://ca.linkedin.com/in/x", "http://linkedin.com/search", "https://lnkd.in/abc", "https://media.licdn.com/x.png"])("blocks %s", (url) => {
    expect(isLinkedInUrl(url)).toBe(true);
    expect(isFetchable(url)).toBe(false);
  });

  it.each(["http://localhost:3000", "http://127.0.0.1/x", "http://10.0.0.5", "http://192.168.1.1", "ftp://example.com", "not a url"])("refuses %s", (url) => {
    expect(isFetchable(url)).toBe(false);
  });

  it("allows public sites, including ones that mention LinkedIn in the path", () => {
    expect(isFetchable("https://ece.utoronto.ca/people")).toBe(true);
    expect(isFetchable("https://example.com/linkedin.com")).toBe(true);
  });
});

describe("HttpPageFetcher", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never sends a request to LinkedIn", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const res = await new HttpPageFetcher().fetch("https://www.linkedin.com/in/alex");
    expect(res).toMatchObject({ ok: false, reason: "blocked host" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("doesn't follow a redirect to LinkedIn", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response(null, { status: 302, headers: { location: "https://www.linkedin.com/in/alex" } });
    });
    const res = await new HttpPageFetcher().fetch("https://example.com/go");
    expect(res.ok).toBe(false);
    expect(calls.some((c) => c.includes("linkedin.com"))).toBe(false);
  });

  it("honours robots.txt", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      String(url).endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /private") : new Response("<p>hi</p>", { headers: { "content-type": "text/html" } }),
    );
    const f = new HttpPageFetcher();
    expect(await f.fetch("https://example.com/private/page")).toMatchObject({ ok: false, reason: "disallowed by robots.txt" });
    expect(await f.fetch("https://example.com/public")).toMatchObject({ ok: true, text: "hi" });
  });

  it("rejects non-HTML content", async () => {
    vi.stubGlobal("fetch", async (url: string) => (String(url).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response("%PDF", { headers: { "content-type": "application/pdf" } })));
    expect(await new HttpPageFetcher().fetch("https://example.com/cv.pdf")).toMatchObject({ ok: false, reason: "not an HTML page" });
  });
});

describe("robotsAllows", () => {
  const robots = `User-agent: *\nDisallow: /admin\nAllow: /admin/public\nDisallow: /*.pdf$\n\nUser-agent: OtherBot\nDisallow: /`;
  it.each([
    ["/", true],
    ["/admin/x", false],
    ["/admin/public/y", true],
    ["/files/cv.pdf", false],
    ["/files/cv.pdf.html", true],
  ])("%s → %s", (path, allowed) => {
    expect(robotsAllows(robots, path)).toBe(allowed);
  });
});

describe("htmlToText", () => {
  it("extracts title, text and absolute links, without scripts", () => {
    const html = `<html><head><title>Alex &amp; Co</title><script>evil()</script></head><body><p>Hello&nbsp;world</p><a href="/about">About</a><a href="https://github.com/alex">GH</a><style>.x{}</style></body></html>`;
    const r = htmlToText(html, "https://alex.dev/");
    expect(r.title).toBe("Alex & Co");
    expect(r.text).toContain("Hello world");
    expect(r.text).not.toContain("evil");
    expect(r.links).toEqual(["https://alex.dev/about", "https://github.com/alex"]);
  });
});
