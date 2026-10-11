import { isLinkedInUrl } from "./blocklist";
import { institutionMatcher, matchInstitution, matchProgram, programMatchers, type NetworkingCriteria } from "./criteria";
import { draftFromGitHub, draftFromOrcid, extractPeopleWithLlm, pageWorthExtracting, verifyExtraction, type PageInput, type PersonDraft } from "./extract";
import type { FetchedPage, PageFetcher } from "./fetch-page";
import type { LLMProvider } from "./llm";
import type { SearchResult } from "./providers/types";

/**
 * One batch of research: search results in, verified person drafts out. Pure
 * apart from the injected fetcher, model and page cache, so it runs the same in
 * tests (fixtures) and production.
 */

export type ResearchDeps = {
  fetcher: PageFetcher;
  llm: LLMProvider;
  criteria: NetworkingCriteria;
  /** URLs already handled in this search; never processed twice. */
  seenUrls: Set<string>;
  pageBudget: number;
  llmBudget: number;
  cachedPage?: (url: string) => Promise<PageInput | null>;
  savePage?: (page: PageInput, provider: string) => Promise<void>;
  concurrency?: number;
};

export type ResearchOutcome = {
  drafts: (PersonDraft & { resultUrl: string })[];
  pagesProcessed: number;
  /** GitHub and ORCID profiles read from search responses. */
  profilesRead: number;
  llmCalls: number;
  factsDropped: number;
  skipped: { linkedin: number; irrelevant: number; failed: number; budget: number };
  /** LinkedIn URLs seen in results: kept as links only, never fetched. */
  linkedinRefs: { url: string; title: string }[];
};

/** Cheap check on the result itself before spending a page fetch on it. */
export function resultLooksRelevant(r: Pick<SearchResult, "title" | "snippet">, criteria: NetworkingCriteria): boolean {
  const text = `${r.title}\n${r.snippet}`;
  const inst = institutionMatcher(criteria);
  if (inst && matchInstitution(text, inst)) return true;
  const programs = programMatchers(criteria);
  return programs.length > 0 && matchProgram(text, programs, true) !== null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function researchResults(results: SearchResult[], deps: ResearchDeps): Promise<ResearchOutcome> {
  const out: ResearchOutcome = { drafts: [], pagesProcessed: 0, profilesRead: 0, llmCalls: 0, factsDropped: 0, skipped: { linkedin: 0, irrelevant: 0, failed: 0, budget: 0 }, linkedinRefs: [] };
  const toFetch: SearchResult[] = [];

  for (const r of results) {
    const key = r.url.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
    if (deps.seenUrls.has(key)) continue;

    if (isLinkedInUrl(r.url)) {
      deps.seenUrls.add(key);
      out.skipped.linkedin++;
      out.linkedinRefs.push({ url: r.url, title: r.title });
      continue;
    }
    // Structured public profiles (GitHub, ORCID) came with the search response: reading them
    // costs no page fetch and no AI call, so they don't use the page budget.
    if (r.structured || r.orcid) {
      deps.seenUrls.add(key);
      out.profilesRead++;
      const d = r.structured ? draftFromGitHub(r.structured, deps.criteria) : draftFromOrcid(r.orcid!, deps.criteria);
      if (d) out.drafts.push({ ...d, resultUrl: r.url });
      else out.skipped.irrelevant++;
      continue;
    }
    if (toFetch.length >= deps.pageBudget) {
      // Not marked as seen, so a later step can still read it.
      out.skipped.budget++;
      continue;
    }
    deps.seenUrls.add(key);
    if (!resultLooksRelevant(r, deps.criteria)) {
      out.skipped.irrelevant++;
      continue;
    }
    toFetch.push(r);
  }

  let llmLeft = deps.llmBudget;
  await mapLimit(toFetch, deps.concurrency ?? 4, async (r) => {
    let page = (await deps.cachedPage?.(r.url)) ?? null;
    if (!page) {
      const fetched: FetchedPage = await deps.fetcher.fetch(r.url);
      if (!fetched.ok) {
        out.skipped.failed++;
        return;
      }
      page = { url: fetched.url, title: fetched.title || r.title, text: fetched.text, links: fetched.links };
      await deps.savePage?.(page, r.provider);
    }
    out.pagesProcessed++;
    if (!pageWorthExtracting(page, deps.criteria)) {
      out.skipped.irrelevant++;
      return;
    }
    if (!deps.llm.enabled || llmLeft <= 0) {
      out.skipped.budget++;
      return;
    }
    llmLeft--;
    out.llmCalls++;
    const extraction = await extractPeopleWithLlm(deps.llm, page, deps.criteria);
    if (!extraction.ok) {
      out.skipped.failed++;
      return;
    }
    const verified = verifyExtraction(extraction.data, page, deps.criteria);
    out.factsDropped += verified.dropped;
    for (const d of verified.people) if (d.facts.length) out.drafts.push({ ...d, resultUrl: r.url });
  });
  return out;
}
