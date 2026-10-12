import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";

/**
 * Fetches a URL that came from outside (a job link, a careers page) without letting it
 * reach the server's own network. Before every connection, including each redirect hop:
 *
 * - only http/https, default ports, no credentials in the URL, no IP-literal hosts and no
 *   cloud metadata hostnames;
 * - the hostname is resolved and every address it resolves to must be public (not
 *   loopback, private, link-local, carrier-grade NAT, multicast, reserved or documentation,
 *   for IPv4 and IPv6, including IPv4-mapped IPv6);
 * - the connection is pinned to the addresses just checked, so a second DNS answer
 *   (rebinding) can't point it somewhere else;
 * - redirects are followed by hand, each target checked again, at most 5.
 *
 * Bodies are capped (64 KB by default); requests time out when idle and when the whole
 * fetch, redirects included, runs past its deadline. No cookies are sent.
 */

export class UnsafeUrlError extends Error {}

type Address = { address: string; family: 4 | 6 };
export type Resolver = (host: string) => Promise<Address[]>;
/** Does one request to an already-vetted address. Swappable in tests. */
/** `timeoutMs` is the socket's idle limit; `deadlineMs` caps the whole request, however slowly the body trickles in. */
export type Transport = (url: URL, address: Address, opts: { timeoutMs: number; deadlineMs: number; maxBytes: number; headers: Record<string, string> }) => Promise<RawResponse>;
export type RawResponse = { status: number; headers: Record<string, string | undefined>; body: string };

export type SafeResponse = RawResponse & { url: string; redirects: string[] };

const METADATA_HOSTS = new Set(["metadata.google.internal", "metadata", "instance-data", "instance-data.ec2.internal"]);
const USER_AGENT = "NetworkGrowthAssistant/1.0 (+checks that job links still work)";

// ------------------------------------------------------------------ address checks

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. 169.254.169.254 metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. 255.255.255.255 broadcast
];

function isPublicV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return !V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ToInt(base) & mask);
  });
}

/** Expands "::ffff:1.2.3.4", "fe80::1" and similar into eight 16-bit groups. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[1]);
    s = s.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const a = head ? head.split(":") : [];
  const b = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  if (tail === undefined && a.length !== 8) return null;
  const groups = [...a, ...new Array(8 - a.length - b.length).fill("0"), ...b].map((g) => parseInt(g || "0", 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function isPublicV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  const embeddedV4 = () => `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
  if (g.every((x) => x === 0)) return false; // :: unspecified
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1 loopback
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPublicV4(embeddedV4()); // ::ffff:a.b.c.d mapped
  if (g.slice(0, 6).every((x) => x === 0)) return isPublicV4(embeddedV4()); // ::a.b.c.d compatible
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicV4(embeddedV4()); // 64:ff9b::/96 NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // 2001:db8::/32 documentation
  if (g[0] === 0x2002) return isPublicV4(`${g[1] >> 8}.${g[1] & 0xff}.${g[2] >> 8}.${g[2] & 0xff}`); // 6to4 embeds an IPv4
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  return true;
}

/** True only for addresses on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  return kind === 4 ? isPublicV4(ip) : kind === 6 ? isPublicV6(ip) : false;
}

// ------------------------------------------------------------------ URL checks

/** The checks that need no network: scheme, credentials, port, IP-literal and metadata hosts. */
export function assertFetchableUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw.toString());
  } catch {
    throw new UnsafeUrlError("not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("only http and https are allowed");
  if (url.username || url.password) throw new UnsafeUrlError("credentials in the URL");
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) throw new UnsafeUrlError("non-standard port");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) throw new UnsafeUrlError("IP address hosts aren't allowed");
  if (!host.includes(".") || METADATA_HOSTS.has(host) || /\.(local|localhost|internal|lan|home|corp)$/.test(host) || host === "localhost") throw new UnsafeUrlError("not a public hostname");
  return url;
}

const systemResolver: Resolver = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));

/** Resolves a host and refuses it if any address is not public. */
export async function resolvePublic(host: string, resolve: Resolver = systemResolver): Promise<Address[]> {
  let addresses: Address[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new UnsafeUrlError("the hostname doesn't resolve");
  }
  if (!addresses.length) throw new UnsafeUrlError("the hostname doesn't resolve");
  const bad = addresses.find((a) => !isPublicAddress(a.address));
  if (bad) throw new UnsafeUrlError("the hostname resolves to a private or reserved address");
  return addresses;
}

// ------------------------------------------------------------------ transport

/** A request pinned to one vetted address: DNS isn't consulted again for this connection. */
const pinnedTransport: Transport = (url, address, opts) =>
  new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: opts.headers,
        timeout: opts.timeoutMs,
        // Every lookup for this request returns only the address we checked.
        lookup: ((_host: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) =>
          options?.all ? cb(null, [{ address: address.address, family: address.family }]) : cb(null, address.address, address.family)) as unknown as LookupFunction,
        servername: url.hostname,
      },
      (res) => {
        res.on("close", () => clearTimeout(timer));
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size <= opts.maxBytes) chunks.push(c);
          else res.destroy();
        });
        const done = () => {
          if (expired) return reject(new Error("timed out"));
          resolve({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : (v ?? "")])),
            body: Buffer.concat(chunks).toString("utf8").slice(0, opts.maxBytes),
          });
        };
        res.on("end", done);
        res.on("close", done);
        res.on("error", reject);
      },
    );
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      req.destroy(new Error("timed out"));
    }, Math.max(1, opts.deadlineMs));
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end();
  });

export type SafeFetchOptions = {
  resolve?: Resolver;
  transport?: Transport;
  maxRedirects?: number;
  /** false: return a redirect response instead of following it (the caller checks the next hop itself). */
  followRedirects?: boolean;
  /** Idle limit per connection (default 8s). */
  timeoutMs?: number;
  /** Limit for the whole fetch, redirects included (default three times timeoutMs). */
  totalTimeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
};

/**
 * GET a URL safely. Throws UnsafeUrlError when a URL (or a redirect) points somewhere it
 * mustn't; network errors and timeouts throw ordinary errors.
 */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const resolve = opts.resolve ?? systemResolver;
  const transport = opts.transport ?? pinnedTransport;
  const maxRedirects = opts.maxRedirects ?? 5;
  const headers = { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5", ...opts.headers };
  const redirects: string[] = [];
  const timeoutMs = opts.timeoutMs ?? 8000;
  const deadline = Date.now() + (opts.totalTimeoutMs ?? timeoutMs * 3);
  let url = assertFetchableUrl(raw);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await resolvePublic(host, resolve);
    const left = deadline - Date.now();
    if (left <= 0) throw new Error("timed out");
    const res = await transport(url, addresses[0], { timeoutMs, deadlineMs: left, maxBytes: opts.maxBytes ?? 64 * 1024, headers });
    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && location && opts.followRedirects !== false) {
      // Every hop is checked again before it's followed.
      url = assertFetchableUrl(new URL(location, url));
      redirects.push(url.toString());
      continue;
    }
    return { ...res, url: url.toString(), redirects };
  }
  throw new UnsafeUrlError("too many redirects");
}
