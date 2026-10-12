import { describe, expect, it, vi } from "vitest";
import { assertFetchableUrl, isPublicAddress, resolvePublic, safeFetch, UnsafeUrlError, type Resolver, type Transport } from "./safe-fetch";

const resolveTo =
  (...addresses: string[]): Resolver =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(":") ? (6 as const) : (4 as const) }));

const ok200: Transport = async () => ({ status: 200, headers: { "content-type": "text/html" }, body: "<p>Job</p>" });

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "127.8.9.10",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "192.0.2.10",
    "198.18.0.1",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "2002:7f00:1::",
  ])("refuses %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
});

describe("assertFetchableUrl", () => {
  it.each(["ftp://example.com/x", "file:///etc/passwd", "https://user:pw@example.com", "https://example.com:8443/x", "http://127.0.0.1/", "https://[::1]/", "http://localhost/", "http://metadata.google.internal/computeMetadata/v1/", "https://printer.local/"])(
    "refuses %s",
    (url) => expect(() => assertFetchableUrl(url)).toThrow(UnsafeUrlError),
  );

  it("allows ordinary https and http URLs", () => {
    expect(assertFetchableUrl("https://boards.greenhouse.io/acme/jobs/1").hostname).toBe("boards.greenhouse.io");
    expect(assertFetchableUrl("http://example.com:80/x").hostname).toBe("example.com");
  });
});

describe("resolvePublic", () => {
  it("refuses a public-looking hostname that resolves to a private address", async () => {
    await expect(resolvePublic("jobs.example.com", resolveTo("10.0.0.5"))).rejects.toThrow(/private or reserved/);
  });

  it("refuses when any one of several addresses is private", async () => {
    await expect(resolvePublic("jobs.example.com", resolveTo("93.184.216.34", "192.168.0.10"))).rejects.toThrow(UnsafeUrlError);
  });

  it("refuses IPv6 loopback and private answers", async () => {
    await expect(resolvePublic("jobs.example.com", resolveTo("::1"))).rejects.toThrow(UnsafeUrlError);
    await expect(resolvePublic("jobs.example.com", resolveTo("fd00::5"))).rejects.toThrow(UnsafeUrlError);
  });

  it("refuses a hostname that doesn't resolve", async () => {
    await expect(resolvePublic("nope.example.com", async () => [])).rejects.toThrow(/doesn't resolve/);
  });
});

describe("safeFetch", () => {
  it("connects only to the address it checked", async () => {
    const transport = vi.fn(ok200);
    const res = await safeFetch("https://jobs.example.com/1", { resolve: resolveTo("93.184.216.34"), transport });
    expect(res.status).toBe(200);
    expect(transport.mock.calls[0][1]).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("checks every redirect before following it: a redirect to a private address is refused", async () => {
    const transport = vi.fn<Transport>(async (url) => (url.hostname === "jobs.example.com" ? { status: 302, headers: { location: "https://internal.example.net/admin" }, body: "" } : { status: 200, headers: {}, body: "secret" }));
    const resolve: Resolver = async (host) => (host === "internal.example.net" ? [{ address: "10.0.0.9", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]);
    await expect(safeFetch("https://jobs.example.com/1", { resolve, transport })).rejects.toThrow(UnsafeUrlError);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect to localhost, an IP or another scheme without requesting it", async () => {
    for (const location of ["http://localhost/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "file:///etc/passwd"]) {
      const transport = vi.fn<Transport>(async () => ({ status: 301, headers: { location }, body: "" }));
      await expect(safeFetch("https://jobs.example.com/1", { resolve: resolveTo("93.184.216.34"), transport })).rejects.toThrow(UnsafeUrlError);
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it("follows legitimate redirects and reports where it ended", async () => {
    const transport: Transport = async (url) => (url.pathname === "/go" ? { status: 301, headers: { location: "/jobs/42" }, body: "" } : { status: 200, headers: {}, body: "ok" });
    const res = await safeFetch("https://jobs.example.com/go", { resolve: resolveTo("93.184.216.34"), transport });
    expect(res.url).toBe("https://jobs.example.com/jobs/42");
    expect(res.redirects).toEqual(["https://jobs.example.com/jobs/42"]);
  });

  it("stops after too many redirects", async () => {
    const transport: Transport = async (url) => ({ status: 302, headers: { location: `${url.pathname}x` }, body: "" });
    await expect(safeFetch("https://jobs.example.com/a", { resolve: resolveTo("93.184.216.34"), transport, maxRedirects: 3 })).rejects.toThrow(/too many redirects/);
  });

  it("gives each hop only what's left of the overall deadline", async () => {
    const deadlines: number[] = [];
    const transport: Transport = async (url, _addr, opts) => {
      deadlines.push(opts.deadlineMs);
      await new Promise((r) => setTimeout(r, 30));
      return url.pathname === "/go" ? { status: 301, headers: { location: "/jobs/42" }, body: "" } : { status: 200, headers: {}, body: "ok" };
    };
    await safeFetch("https://jobs.example.com/go", { resolve: resolveTo("93.184.216.34"), transport, totalTimeoutMs: 1000 });
    expect(deadlines[0]).toBeLessThanOrEqual(1000);
    expect(deadlines[1]).toBeLessThan(deadlines[0]);
  });

  it("gives up when redirects run past the overall deadline", async () => {
    const transport: Transport = async (url) => {
      await new Promise((r) => setTimeout(r, 30));
      return { status: 302, headers: { location: `${url.pathname}x` }, body: "" };
    };
    await expect(safeFetch("https://jobs.example.com/a", { resolve: resolveTo("93.184.216.34"), transport, totalTimeoutMs: 50 })).rejects.toThrow(/timed out/);
  });
});
