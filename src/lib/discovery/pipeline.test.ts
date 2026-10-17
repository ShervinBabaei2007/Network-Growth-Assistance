import { describe, expect, it } from "vitest";
import { testCriteria } from "@/test/discovery";
import { DEFAULT_BUDGET, pagesThisStep, stopReason, type Progress } from "./budget";
import { FixtureGitHubProvider, FixtureLLM, FixturePageFetcher, FixtureWebProvider } from "./fixtures";
import { disabledLLM } from "./llm";
import { researchResults } from "./pipeline";

const criteria = testCriteria("Find 50 UofT Computer Engineering software engineers");

async function run(opts: { pageBudget?: number; llmBudget?: number; llm?: FixtureLLM | typeof disabledLLM } = {}) {
  const fetcher = new FixturePageFetcher();
  const llm = opts.llm ?? new FixtureLLM();
  const results = [...(await new FixtureWebProvider().search("q")), ...(await new FixtureGitHubProvider().search())];
  const out = await researchResults(results, { fetcher, llm, criteria, seenUrls: new Set(), pageBudget: opts.pageBudget ?? 50, llmBudget: opts.llmBudget ?? 50 });
  return { out, fetcher, llm };
}

describe("researchResults", () => {
  it("finds verified people from public sources", async () => {
    const { out } = await run();
    const names = out.drafts.map((d) => d.fullName).sort();
    expect(names).toEqual(["Alex Chen", "Jordan Lee", "Priya Raman", "Sam Lee", "Sam Patel", "Taylor Kim", "Wei Zhang"]);
    expect(out.factsDropped).toBeGreaterThan(0);
  });

  it("filters a lookalike school before spending an AI call on it", async () => {
    const { out, llm } = await run();
    // Toronto Metropolitan University is not the University of Toronto.
    expect(out.drafts.some((d) => d.fullName === "Maria Gomez")).toBe(false);
    expect(out.skipped.irrelevant).toBe(1);
    expect((llm as FixtureLLM).calls).toBe(4);
  });

  it("never fetches LinkedIn and keeps its URL as a reference only", async () => {
    const { out, fetcher } = await run();
    expect(fetcher.fetched.some((u) => u.includes("linkedin.com"))).toBe(false);
    expect(out.skipped.linkedin).toBe(1);
    expect(out.linkedinRefs[0].url).toContain("linkedin.com/in/");
  });

  it("respects the page budget", async () => {
    const { out, fetcher } = await run({ pageBudget: 2 });
    expect(out.pagesProcessed).toBeLessThanOrEqual(2);
    expect(fetcher.fetched.length).toBeLessThanOrEqual(2);
  });

  it("respects the AI budget", async () => {
    const { out, llm } = await run({ llmBudget: 1 });
    expect(out.llmCalls).toBe(1);
    expect((llm as FixtureLLM).calls).toBe(1);
  });

  it("still uses GitHub without AI", async () => {
    const { out } = await run({ llm: disabledLLM });
    expect(out.drafts.map((d) => d.fullName)).toEqual(["Taylor Kim", "Sam Lee"]);
  });

  it("doesn't process a URL twice in the same search", async () => {
    const seen = new Set<string>();
    const fetcher = new FixturePageFetcher();
    const results = await new FixtureWebProvider().search("q");
    await researchResults(results, { fetcher, llm: new FixtureLLM(), criteria, seenUrls: seen, pageBudget: 50, llmBudget: 50 });
    const second = await researchResults(results, { fetcher, llm: new FixtureLLM(), criteria, seenUrls: seen, pageBudget: 50, llmBudget: 50 });
    expect(second.drafts).toHaveLength(0);
    expect(second.pagesProcessed).toBe(0);
  });
});

describe("budgets and stop conditions", () => {
  const p = (over: Partial<Progress> = {}): Progress => ({ queriesRun: 0, pagesProcessed: 0, candidatesConsidered: 0, llmCalls: 0, verified: 0, emptyBatches: 0, queriesRemaining: 10, ...over });

  it.each([
    [{ verified: 50 }, "target_reached"],
    [{ queriesRun: 30 }, "query_budget"],
    [{ pagesProcessed: 100 }, "page_budget"],
    [{ candidatesConsidered: 200 }, "candidate_budget"],
    [{ llmCalls: 60 }, "llm_budget"],
    [{ emptyBatches: 2 }, "no_new_people"],
    [{ queriesRemaining: 0 }, "plan_exhausted"],
    [{}, null],
  ] as const)("%o → %s", (over, reason) => {
    expect(stopReason(p(over), DEFAULT_BUDGET, 50)).toBe(reason);
  });

  it("never gives a step more pages than remain", () => {
    expect(pagesThisStep(p({ pagesProcessed: 95 }), DEFAULT_BUDGET)).toBe(5);
    expect(pagesThisStep(p({ pagesProcessed: 120 }), DEFAULT_BUDGET)).toBe(0);
  });
});
