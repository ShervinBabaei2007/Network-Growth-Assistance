import { isFetchable } from "./blocklist";

/**
 * Fetches one public web page for evidence. It refuses LinkedIn and private hosts,
 * respects robots.txt, follows redirects only to allowed hosts, and keeps the page
 * small: a bounded amount of readable text plus the links on the page.
 */

export type FetchedPage = { ok: true; url: string; title: string; text: string; links: string[] } | { ok: false; url: string; reason: string };

export interface PageFetcher {
  fetch(url: string): Promise<FetchedPage>;
}

const USER_AGENT = "NetworkGrowthAssistant/1.0 (+personal research tool; respects robots.txt)";
const ROBOTS_AGENT = "networkgrowthassistant";
const MAX_BYTES = 1_500_000;
export const MAX_TEXT = 60_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", middot: "·", bull: "•" };

function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (ENTITIES[k]) return ENTITIES[k];
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
    if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)) || 32);
    return m;
  });
}

/** Readable text, the title and absolute links from HTML, without a DOM library. */
export function htmlToText(html: string, baseUrl: string): { title: string; text: string; links: string[] } {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const links = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    try {
      const u = new URL(decodeEntities(m[1]), baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") links.add(u.toString());
    } catch {
      // ignore malformed links
    }
  }
  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<head\b[\s\S]*?<\/head>/i, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/header|\/footer)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, MAX_TEXT);
  return { title, text, links: [...links].slice(0, 300) };
}

/** Minimal robots.txt check for our agent and "*": longest matching Allow/Disallow wins. */
export function robotsAllows(robots: string, path: string): boolean {
  type Rule = { allow: boolean; prefix: string };
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value || key === "allow") current.rules.push({ allow: key === "allow", prefix: value });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && ROBOTS_AGENT.includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  let best: Rule | null = null;
  for (const r of rules) {
    // Robots patterns: "*" matches anything, a trailing "$" anchors the end.
    const anchored = r.prefix.endsWith("$");
    const body = (anchored ? r.prefix.slice(0, -1) : r.prefix).replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const matches = new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
    // The most specific (longest) rule wins; on a tie Allow wins.
    if (matches && (!best || r.prefix.length > best.prefix.length || (r.prefix.length === best.prefix.length && r.allow))) best = r;
  }
  return best ? best.allow : true;
}

export class HttpPageFetcher implements PageFetcher {
  private robots = new Map<string, Promise<string | null>>();

  private robotsFor(origin: string): Promise<string | null> {
    let p = this.robots.get(origin);
    if (!p) {
      p = fetch(`${origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(5_000), cache: "no-store", redirect: "follow" })
        .then((r) => (r.ok ? r.text() : null))
        .catch(() => null);
      this.robots.set(origin, p);
    }
    return p;
  }

  async fetch(url: string): Promise<FetchedPage> {
    let target = url;
    for (let hop = 0; hop < 4; hop++) {
      if (!isFetchable(target)) return { ok: false, url, reason: "blocked host" };
      const u = new URL(target);
      const robots = await this.robotsFor(u.origin);
      if (robots && !robotsAllows(robots, u.pathname + u.search)) return { ok: false, url, reason: "disallowed by robots.txt" };

      let res: Response;
      try {
        res = await fetch(target, {
          headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        });
      } catch {
        return { ok: false, url, reason: "unreachable" };
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        target = new URL(res.headers.get("location")!, target).toString();
        continue;
      }
      if (!res.ok) return { ok: false, url, reason: `HTTP ${res.status}` };
      const type = res.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml/i.test(type)) return { ok: false, url, reason: "not an HTML page" };
      const length = Number(res.headers.get("content-length") ?? 0);
      if (length > MAX_BYTES) return { ok: false, url, reason: "page too large" };
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) return { ok: false, url, reason: "page too large" };
      const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      const { title, text, links } = htmlToText(html, target);
      return { ok: true, url: target, title, text, links };
    }
    return { ok: false, url, reason: "too many redirects" };
  }
}
