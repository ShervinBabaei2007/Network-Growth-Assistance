import type { PageFetcher } from "@/lib/discovery/fetch-page";
import type { AtsKind } from "./types";

export type DetectedBoard = { ats: Exclude<AtsKind, "fixture">; token: string };

const TOKEN = "([A-Za-z0-9._-]{1,120})";
const PATTERNS: [Exclude<AtsKind, "fixture">, RegExp][] = [
  ["greenhouse", new RegExp(`^https?://(?:boards|job-boards)(?:\\.eu)?\\.greenhouse\\.io/(?:embed/job_board(?:/js)?\\?for=)?${TOKEN}`, "i")],
  ["greenhouse", new RegExp(`^https?://boards-api\\.greenhouse\\.io/v1/boards/${TOKEN}`, "i")],
  ["lever", new RegExp(`^https?://jobs(?:\\.eu)?\\.lever\\.co/${TOKEN}`, "i")],
  ["ashby", new RegExp(`^https?://jobs\\.ashbyhq\\.com/${TOKEN}`, "i")],
  ["smartrecruiters", new RegExp(`^https?://(?:careers|jobs)\\.smartrecruiters\\.com/${TOKEN}`, "i")],
  ["workable", new RegExp(`^https?://apply\\.workable\\.com/${TOKEN}`, "i")],
  ["recruitee", new RegExp(`^https?://${TOKEN}\\.recruitee\\.com`, "i")],
];
// Path segments that aren't board names.
const NOT_TOKENS = new Set(["embed", "api", "j", "jobs", "v1", "o", "careers", "www"]);

/**
 * A Workday career site: https://{tenant}.wd{N}.myworkdayjobs.com/{locale?}/{site}/… →
 * "tenant.wdN.site". Locale segments ("en-US") and the API path aren't the site.
 */
const WORKDAY = /^https?:\/\/([a-z0-9_-]+)\.(wd\d{1,3})\.myworkdayjobs\.com\/(?:wday\/cxs\/[a-z0-9_-]+\/)?(?:[a-z]{2}(?:-[a-z]{2})?\/)?([A-Za-z0-9_-]{1,80})(?=[/?#]|$)/i;
const NOT_WORKDAY_SITES = new Set(["job", "jobs", "wday", "login", "details"]);

/** The ATS board a URL points to, if any: "https://jobs.lever.co/acme/123" → lever/acme. */
export function detectBoard(url: string): DetectedBoard | null {
  const wd = url.trim().match(WORKDAY);
  if (wd && !NOT_WORKDAY_SITES.has(wd[3].toLowerCase())) return { ats: "workday", token: `${wd[1].toLowerCase()}.${wd[2].toLowerCase()}.${wd[3]}` };
  for (const [ats, re] of PATTERNS) {
    const m = url.trim().match(re);
    if (m && !NOT_TOKENS.has(m[1].toLowerCase())) return { ats, token: m[1] };
  }
  return null;
}

/**
 * Finds the board behind a careers page: the URL itself, or a link on the page to a
 * known ATS. The page is read with the robots-respecting fetcher; LinkedIn is refused.
 */
export async function detectFromCareersUrl(url: string, fetcher: PageFetcher): Promise<DetectedBoard | null> {
  const direct = detectBoard(url);
  if (direct) return direct;
  const page = await fetcher.fetch(url);
  if (!page.ok) return null;
  const counts = new Map<string, { board: DetectedBoard; n: number }>();
  for (const link of page.links) {
    const b = detectBoard(link);
    if (!b) continue;
    const key = `${b.ats}:${b.token.toLowerCase()}`;
    counts.set(key, { board: b, n: (counts.get(key)?.n ?? 0) + 1 });
  }
  // The board the page links to most.
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.board ?? null;
}
