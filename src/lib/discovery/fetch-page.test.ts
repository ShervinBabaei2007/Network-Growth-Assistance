import { describe, expect, it, vi } from "vitest";
import type { RawResponse, Resolver, Transport } from "@/lib/net/safe-fetch";
import { isFetchable, isLinkedInUrl } from "./blocklist";
import { htmlToText, HttpPageFetcher, robotsAllows } from "./fetch-page";

/** A fetcher on a fake network: every host resolves to a public address, responses come from `respond`. */
function fakeNet(respond: (url: string) => RawResponse, resolve: Resolver = async () => [{ address: "93.184.216.34", family: 4 }]) {
  const calls: string[] = [];
  const transport: Transport = async (url) => {
    calls.push(url.toString());
    return respond(url.toString());
  };
  return { fetcher: new HttpPageFetcher({ resolve, transport }), calls };
}
const html = (body: string): RawResponse => ({ status: 200, headers: { "content-type": "text/html" }, body });
const notFound: RawResponse = { status: 404, headers: {}, body: "" };

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
  it("never sends a request to LinkedIn", async () => {
    const respond = vi.fn(() => html(""));
    const { fetcher } = fakeNet(respond);
    const res = await fetcher.fetch("https://www.linkedin.com/in/alex");
    expect(res).toMatchObject({ ok: false, reason: "blocked host" });
    expect(respond).not.toHaveBeenCalled();
  });

  it("doesn't follow a redirect to LinkedIn", async () => {
    const { fetcher, calls } = fakeNet((url) => (url.endsWith("/robots.txt") ? notFound : { status: 302, headers: { location: "https://www.linkedin.com/in/alex" }, body: "" }));
    const res = await fetcher.fetch("https://example.com/go");
    expect(res.ok).toBe(false);
    expect(calls.some((c) => c.includes("linkedin.com"))).toBe(false);
  });

  it("honours robots.txt", async () => {
    const { fetcher } = fakeNet((url) => (url.endsWith("/robots.txt") ? { status: 200, headers: {}, body: "User-agent: *\nDisallow: /private" } : html("<p>hi</p>")));
    expect(await fetcher.fetch("https://example.com/private/page")).toMatchObject({ ok: false, reason: "disallowed by robots.txt" });
    expect(await fetcher.fetch("https://example.com/public")).toMatchObject({ ok: true, text: "hi" });
  });

  it("rejects non-HTML content", async () => {
    const { fetcher } = fakeNet((url) => (url.endsWith("/robots.txt") ? notFound : { status: 200, headers: { "content-type": "application/pdf" }, body: "%PDF" }));
    expect(await fetcher.fetch("https://example.com/cv.pdf")).toMatchObject({ ok: false, reason: "not an HTML page" });
  });

  it("refuses a public-looking hostname that resolves to a private address", async () => {
    const respond = vi.fn(() => html("<p>internal</p>"));
    const { fetcher } = fakeNet(respond, async () => [{ address: "10.0.0.7", family: 4 }]);
    expect(await fetcher.fetch("https://intranet.example.org/page")).toMatchObject({ ok: false, reason: "blocked host" });
    expect(respond).not.toHaveBeenCalled();
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
