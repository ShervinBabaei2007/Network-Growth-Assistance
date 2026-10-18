import { expect, test, type Page } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/**
 * Long-task trace per page at 4x CPU throttling, filled with example data. A report, not a gate, unless
 * PERF_MAX_MS is set (then no single task may run longer). Run against a production build for real numbers:
 *   npm run build && PERF=1 npx playwright test e2e/perf-longtasks.spec.ts --project=desktop
 * (start `next start -p 3000` with the e2e environment first; a dev server is much slower and is not representative).
 */

test.skip(!process.env.PERF, "Set PERF=1 to run the long-task trace.");

const PAGES = ["/overview", "/candidates", "/people", "/applications", "/jobs", "/jobs/resume", "/settings", "/help"];

type Trace = { path: string; nodes: number; longest: number; total: number; count: number };

async function trace(page: Page, path: string): Promise<Trace> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const durations = await page.evaluate(() => (window as unknown as { __long: number[] }).__long ?? []);
  const nodes = await page.evaluate(() => document.getElementsByTagName("*").length);
  return { path, nodes, longest: Math.round(Math.max(0, ...durations)), total: Math.round(durations.reduce((a, b) => a + b, 0)), count: durations.length };
}

test("long tasks per page at 4x CPU throttling", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, uniqueEmail("perf"), "/overview", { welcome: true });
  const wizard = page.getByTestId("onboarding-wizard");
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  await wizard.getByRole("button", { name: "Look around with example data" }).click();
  await expect(page.getByTestId("sample-banner")).toBeVisible();
  await page.getByRole("button", { name: /skip/i }).first().click({ timeout: 3000 }).catch(() => {});

  await page.addInitScript(() => {
    const long: number[] = [];
    (window as unknown as { __long: number[] }).__long = long;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) long.push(e.duration);
    }).observe({ type: "longtask", buffered: true });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  // PERF_PROFILE=/jobs also prints where that page spends its CPU time, by script file.
  const profiled = process.env.PERF_PROFILE;
  if (profiled) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
    await trace(page, profiled);
    const { profile } = await cdp.send("Profiler.stop");
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map<string, number>();
    profile.samples?.forEach((id, i) => {
      const n = byId.get(id)!;
      const key = `${n.callFrame.url.split("/").slice(-2).join("/") || "(native)"} ${n.callFrame.functionName || "(anon)"}`;
      self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas?.[i] ?? 0));
    });
    console.log("\nCPU by function (ms, throttled):");
    [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(`${String(Math.round(v / 1000)).padStart(6)}  ${k}`));
  }

  if (process.env.PERF_NODES) {
    await page.goto(process.env.PERF_NODES);
    await page.waitForLoadState("networkidle");
    const hist = await page.evaluate(() => {
      const li = document.querySelector("main ul > li");
      const h: Record<string, number> = {};
      li?.querySelectorAll("*").forEach((e) => (h[e.tagName.toLowerCase()] = (h[e.tagName.toLowerCase()] ?? 0) + 1));
      const total = document.getElementsByTagName("*").length;
      const rest = total - document.querySelectorAll("main ul > li *").length;
      return { perCard: h, cards: document.querySelectorAll("main ul > li").length, outsideCards: rest };
    });
    console.log("NODES " + JSON.stringify(hist));
  }

  // PERF_TRACE=/jobs prints which kinds of browser work (script, layout, style, parsing) fill the page's longest task.
  if (process.env.PERF_TRACE) {
    const events: { name: string; ph: string; dur?: number; ts: number; tid: number }[] = [];
    cdp.on("Tracing.dataCollected", (e) => events.push(...(e.value as unknown as typeof events)));
    await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline", transferMode: "ReportEvents" });
    await trace(page, process.env.PERF_TRACE);
    const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.end");
    await done;
    const tasks = events.filter((e) => e.name === "RunTask" && e.ph === "X").sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0));
    const top = tasks[0];
    if (top) {
      const inside = events.filter((e) => e.ph === "X" && e.tid === top.tid && e.ts >= top.ts && e.ts + (e.dur ?? 0) <= top.ts + (top.dur ?? 0) && e !== top && (e.dur ?? 0) > 500);
      const byName = new Map<string, number>();
      for (const e of inside) byName.set(e.name, (byName.get(e.name) ?? 0) + (e.dur ?? 0));
      console.log(`TRACE longest task ${Math.round((top.dur ?? 0) / 1000)} ms (throttled)`);
      [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log(`TRACE ${String(Math.round(v / 1000)).padStart(5)} ms  ${k}`));
    }
  }

  const rows: Trace[] = [];
  for (const path of PAGES) rows.push(await trace(page, path));
  // The first application's detail page, the heaviest client component.
  await page.goto("/applications");
  const first = page.locator('a[href^="/applications/"]').first();
  if (await first.count()) rows.push(await trace(page, (await first.getAttribute("href"))!));

  console.log("\n" + ["page".padEnd(34), "nodes", "longest ms", "total ms", "tasks"].join("  "));
  for (const r of rows) console.log([r.path.padEnd(34), String(r.nodes).padStart(5), String(r.longest).padStart(10), String(r.total).padStart(8), String(r.count).padStart(5)].join("  "));

  const max = Number(process.env.PERF_MAX_MS);
  if (max) for (const r of rows) expect(r.longest, `${r.path} longest task`).toBeLessThanOrEqual(max);
});
