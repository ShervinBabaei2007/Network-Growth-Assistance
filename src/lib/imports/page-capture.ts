import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";

/**
 * Turns a page the user copied by hand (Ctrl+A, Ctrl+C on a LinkedIn search
 * results page) into a list of people. Nothing here contacts LinkedIn: it only
 * reads the HTML the browser put on the clipboard. The parser relies on profile
 * links and visible text, not on LinkedIn's class names, so markup changes are
 * less likely to break it, and every result is shown for review before saving.
 */

export type CaptureBlock = { href: string; lines: string[] };

export type CapturedPerson = {
  key: string;
  url: string;
  name: string;
  headline: string | null;
  /** Extra context LinkedIn shows, e.g. "Current: Student at UBC". */
  details: string[];
};

/**
 * A profile link from copied HTML. Browsers resolve relative links against the
 * page they were pasted or copied into, so a LinkedIn "/in/name" link can arrive
 * as "http://localhost/in/name"; the profile path is what identifies the person.
 */
export function profileFromHref(href: string) {
  const direct = normalizeProfileUrl(href.startsWith("/") ? `https://www.linkedin.com${href}` : href);
  if (direct.ok) return direct;
  try {
    const path = new URL(href, "https://www.linkedin.com").pathname;
    if (/^\/(mwlite\/)?in\/[^/]+/.test(path)) return normalizeProfileUrl(`https://www.linkedin.com${path}`);
  } catch {
    // fall through
  }
  return direct;
}

// Inline formatting LinkedIn uses inside a line, e.g. to highlight search terms.
const FORMATTING_TAGS = new Set(["STRONG", "B", "EM", "I", "MARK", "U", "SMALL"]);

/**
 * Lines of text in an element. Each element starts a new line except inline
 * formatting, so "Student at <strong>UBC</strong>" stays one line while a name
 * and its hidden "View … profile" label become separate lines.
 */
function textLines(el: Element): string[] {
  const lines: string[] = [];
  let current = "";
  let currentOwner: Element | null = null;
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script,style,template")) continue;
    let owner: Element = parent;
    while (FORMATTING_TAGS.has(owner.tagName) && owner.parentElement && owner !== el) owner = owner.parentElement;
    const text = (node.textContent ?? "").replace(/\s+/g, " ");
    if (owner !== currentOwner) {
      if (current.trim()) lines.push(current.trim());
      current = "";
      currentOwner = owner;
    }
    current += text;
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

/** The smallest ancestor that holds one person's result and nobody else's. */
function personContainer(link: Element, keyOf: (a: Element) => string | null): Element {
  const key = keyOf(link);
  let el: Element = link;
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    const others = [...parent.querySelectorAll("a[href]")].some((a) => {
      const k = keyOf(a);
      return k !== null && k !== key;
    });
    if (others) break;
    el = parent;
    if (parent.tagName === "LI") break;
  }
  return el;
}

/** DOM half: finds each profile link and the text around it. */
export function extractBlocks(root: ParentNode & { ownerDocument?: Document | null }): CaptureBlock[] {
  const keyOf = (a: Element) => {
    const href = a.getAttribute("href") ?? "";
    if (!/\/in\//.test(href)) return null;
    const r = profileFromHref(href);
    return r.ok ? r.key : null;
  };

  const seen = new Map<string, CaptureBlock>();
  for (const a of root.querySelectorAll("a[href]")) {
    const key = keyOf(a);
    // Site navigation (e.g. the "Me" link to your own profile) is never a result.
    if (!key || a.closest("nav,header,footer")) continue;
    const container = personContainer(a, keyOf);
    const block = { href: a.getAttribute("href")!, lines: textLines(container) };
    const prev = seen.get(key);
    // The same person is linked several times (photo, name); keep the richest text.
    if (!prev || block.lines.join(" ").length > prev.lines.join(" ").length) seen.set(key, block);
  }
  return [...seen.values()];
}

// Text LinkedIn shows around a result that isn't the name or headline.
const NOISE = [
  /^view .*profile$/i,
  /^status is (online|offline|reachable)/i,
  /^•?\s*(1st|2nd|3rd\+?)( degree connection)?$/i,
  /^(1st|2nd|3rd\+?) degree connection$/i,
  /^(connect|message|follow|following|pending|invite sent|send inmail|more|save)$/i,
  /mutual connections?/i,
  /^[\d,.]+k?\+? followers?$/i,
  /^•$/,
  /^(premium|open to work|hiring|provides services)$/i,
  // Navigation bar text that ends up in a whole-page copy.
  /^(me|home|my network|jobs|messaging|notifications|for business|try premium.*|skip to (main )?content)$/i,
];

const isNoise = (line: string) => NOISE.some((r) => r.test(line));

/** Pure half: blocks of text → people, deduplicated by profile. */
export function parseBlocks(blocks: CaptureBlock[]): CapturedPerson[] {
  const people = new Map<string, CapturedPerson>();
  for (const b of blocks) {
    const url = profileFromHref(b.href);
    if (!url.ok || people.has(url.key)) continue;

    const lines = b.lines
      .map((l) => l.replace(/\s*•\s*(1st|2nd|3rd\+?)\s*$/i, "").trim())
      .filter((l) => l && !isNoise(l));
    // LinkedIn repeats the name for screen readers; drop exact repeats.
    const unique = lines.filter((l, i) => lines.indexOf(l) === i);
    const nameLine = unique.find((l) => l.length <= 80 && !/^(current|past|summary|skills):/i.test(l));
    if (!nameLine || /^linkedin member$/i.test(nameLine)) continue; // out-of-network members have no usable name

    const rest = unique.filter((l) => l !== nameLine);
    const details = rest.filter((l) => /^(current|past|summary|skills):/i.test(l));
    const headline = rest.find((l) => !details.includes(l)) ?? null;
    people.set(url.key, { key: url.key, url: url.url, name: nameLine, headline, details });
  }
  return [...people.values()];
}

/** Browser entry point: clipboard HTML → people. */
export function captureFromHtml(html: string, parser: DOMParser): CapturedPerson[] {
  const doc = parser.parseFromString(html, "text/html");
  return parseBlocks(extractBlocks(doc));
}

/** Plain-text fallback: a list of profile URLs, one per line or mixed with text. */
export function captureFromText(text: string): CapturedPerson[] {
  const out = new Map<string, CapturedPerson>();
  for (const m of text.matchAll(/(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/(?:mwlite\/)?in\/[^\s"'<>)]+/gi)) {
    const r = normalizeProfileUrl(m[0]);
    if (r.ok && !out.has(r.key)) out.set(r.key, { key: r.key, url: r.url, name: "", headline: null, details: [] });
  }
  return [...out.values()];
}
