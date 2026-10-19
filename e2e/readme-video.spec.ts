import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { dropFixtureNotes, freshAccount, PASTED_RESULTS, prepareJobs, seedNetwork, tidy } from "./readme-kit";

/**
 * Records the raw footage for the tour at the top of README.md: `npm run docs:video`, which then edits it
 * (scripts/docs/make-video.mjs) into docs/media/demo.mp4 and docs/images/demo.webp.
 *
 * Fictional data only: the same people, plan and applications as the README pictures (readme-kit.ts), and the app's
 * fictional job and people datasets. The window shows a cursor; titles, zooms and the window frame are added in the edit,
 * from the marks this writes to timeline.json. Nothing here is a test of behaviour; the other specs cover that.
 * Needs `npm run db:start`; the Playwright config starts the app with DISCOVERY_FIXTURES and JOBS_FIXTURES.
 */

const RAW = "test-results/readme-video";

/** Injected into every page of the recorded window: the interface drawn 1.5x larger, a cursor and a click ripple. */
const OVERLAY = `
(() => {
  const Z = __ZOOM__;
  const css = document.createElement("style");
  css.textContent = \`
    html { zoom: __ZOOM__; }
    nextjs-portal { display: none !important; }
    [data-testid="sample-banner"], [data-testid="toast"], [data-slot="toast-region"] { display: none !important; }
    #rv-cursor { position: fixed; z-index: 2147483647; width: 26px; height: 26px; margin: -3px 0 0 -5px; pointer-events: none; left: 0; top: 0; filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
    #rv-ripple { position: fixed; z-index: 2147483646; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(37,99,235,.18); border: 2.5px solid rgba(37,99,235,.9); pointer-events: none; opacity: 0; }
    #rv-ripple.go { animation: rv-ping .5s cubic-bezier(.2,.7,.3,1); }
    @keyframes rv-ping { from { opacity: 1; transform: scale(.35); } to { opacity: 0; transform: scale(1.5); } }
  \`;
  const mount = () => {
    document.head.append(css);
    document.body.insertAdjacentHTML("beforeend", \`
      <svg id="rv-cursor" viewBox="0 0 26 26"><path d="M5 2.5v19.2l5.2-5 3.4 7.8 3.6-1.6-3.4-7.6h7.3z" fill="#0f172a" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>
      <div id="rv-ripple"></div>\`);
    const cur = document.getElementById("rv-cursor"), rip = document.getElementById("rv-ripple");
    const at = (x, y) => { x /= Z; y /= Z; cur.style.transform = "translate(" + x + "px," + y + "px)"; rip.style.left = x + "px"; rip.style.top = y + "px"; };
    addEventListener("mousemove", (e) => { at(e.clientX, e.clientY); sessionStorage.setItem("rv-pos", e.clientX + "," + e.clientY); }, true);
    addEventListener("mousedown", () => { rip.classList.remove("go"); void rip.offsetWidth; rip.classList.add("go"); }, true);
    const saved = sessionStorage.getItem("rv-pos");
    at(...(saved ? saved.split(",").map(Number) : [1500, 760]));
    // The fictional people dataset labels its answers; the video says the data is fictional instead.
    const strip = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.includes(" (fixture: no canned answer)")) n.nodeValue = n.nodeValue.replace(" (fixture: no canned answer)", "");
    };
    addEventListener("load", () => setTimeout(() => { strip(); new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, characterData: true }); }, 300));
  };
  if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);
})();
`;

/**
 * Screen capture straight from the browser, as numbered JPEG frames with their times (Page.startScreencast). Playwright's own
 * video recorder caps the picture at about 1 Mbps; this keeps full quality at the window's real size.
 */
async function startCapture(context: BrowserContext, page: Page, dir: string, max: { width: number; height: number }) {
  mkdirSync(dir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const frames: { t: number }[] = [];
  const writes: Promise<void>[] = [];
  let origin = 0;
  const startedAt = Date.now();
  cdp.on("Page.screencastFrame", (f) => {
    const t = f.metadata.timestamp! * 1000;
    if (!origin) origin = t - (Date.now() - startedAt);
    const name = `${dir}/${String(frames.length).padStart(5, "0")}.jpg`;
    frames.push({ t: (t - origin) / 1000 });
    writes.push(Promise.resolve(writeFileSync(name, Buffer.from(f.data, "base64"))));
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  const params = { format: "jpeg" as const, quality: 95, maxWidth: max.width, maxHeight: max.height, everyNthFrame: 1 };
  await cdp.send("Page.startScreencast", params);

  return {
    /** Seconds since the capture began, on the same clock as the frames. */
    now: () => Math.round((Date.now() - startedAt) / 10) / 100,
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await Promise.all(writes);
      return frames;
    },
  };
}

/**
 * Screenshots taken back to back, for the phone: an emulated phone stops sending screencast frames after a navigation,
 * and a screenshot keeps the full 2x pixel density.
 */
function startShots(page: Page, dir: string) {
  mkdirSync(dir, { recursive: true });
  const frames: { t: number }[] = [];
  const startedAt = Date.now();
  let running = true;
  const loop = (async () => {
    while (running) {
      const t = (Date.now() - startedAt) / 1000;
      const buf = await page.screenshot({ type: "jpeg", quality: 92 }).catch(() => null);
      if (buf) {
        writeFileSync(`${dir}/${String(frames.length).padStart(5, "0")}.jpg`, buf);
        frames.push({ t });
      }
    }
  })();
  return {
    now: () => Math.round((Date.now() - startedAt) / 10) / 100,
    async stop() {
      running = false;
      await loop;
      return frames;
    },
  };
}

/** How much longer than written every pause in the tour lasts, so a viewer can follow each step. */
const PACE = 1.8;
const hold = (page: Page, ms: number) => page.waitForTimeout(ms * PACE);

/** Moves the cursor like a hand would: eased, a little under a second. */
async function glide(page: Page, target: Locator | { x: number; y: number }, ms = 900) {
  let to: { x: number; y: number };
  if ("x" in target) to = target;
  else {
    const box = await target.boundingBox();
    if (!box) return;
    to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  const from = await page.evaluate(() => (sessionStorage.getItem("rv-pos") ?? "1500,760").split(",").map(Number));
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    await page.mouse.move(from[0] + (to.x - from[0]) * e, from[1] + (to.y - from[1]) * e);
    await page.waitForTimeout(8);
  }
  await hold(page, 160);
}
const scrollToShow = (locator: Locator, offset: number) =>
  locator.evaluate((el, o) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: "smooth" }), offset);

test("record the tour", async ({ browser }) => {
  test.setTimeout(480_000);
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });
  const baseURL = test.info().project.use.baseURL;

  // ---- Setup, not recorded: a fictional network, a plan, the job boards read and a resume imported.
  const setup = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL });
  const s = await setup.newPage();
  const email = await freshAccount("sam.rivera");
  await signIn(s, email);
  await seedNetwork(s, email);
  test.skip(!(await prepareJobs(s)), "Run the dev server with JOBS_FIXTURES=1 and DISCOVERY_FIXTURES=1");
  const storageState = await setup.storageState();
  await setup.close();

  // ---- The recorded window (desktop).
  // A real 1920x1080 window with the interface drawn 1.5x larger, so it reads like a 1280x720 one but is captured at full 1080p.
  const ZOOM = 1.5;
  const rec = await browser.newContext({ storageState, baseURL, viewport: { width: 1920, height: 1080 } });
  await tidy(rec);
  await rec.addInitScript(OVERLAY.replaceAll("__ZOOM__", String(ZOOM)));
  await rec.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await rec.newPage();
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: /overview/i }).first()).toBeVisible();
  await hold(page, 800);
  const capture = await startCapture(rec, page, `${RAW}/desktop`, { width: 1920, height: 1080 });
  const now = capture.now;

  type Scene = { id: string; start: number; end: number; fast: [number, number, number][] };
  const scenes: Scene[] = [];
  const zooms: { start: number; end: number; rect: { x: number; y: number; width: number; height: number } }[] = [];
  const paths: { t: number; path: string }[] = [];
  let scene: Scene;
  const begin = (id: string) => {
    scene = { id, start: now(), end: 0, fast: [] };
    scenes.push(scene);
  };
  const end = () => (scene.end = now());
  page.on("framenavigated", (f) => f === page.mainFrame() && paths.push({ t: now(), path: new URL(f.url()).pathname + new URL(f.url()).search }));
  paths.push({ t: 0, path: "/overview" });
  /** Zooms the edit in on an element from now until the returned function is called. */
  const zoomOn = async (locator: Locator) => {
    const rect = (await locator.boundingBox())!;
    const z = { start: now(), end: 0, rect };
    zooms.push(z);
    return () => (z.end = now());
  };

  // 1. Overview: honest progress.
  begin("overview");
  await hold(page, 1300);
  await page.locator("[data-tour=breakdown]").evaluate((el) => ((el as HTMLDetailsElement).open = true));
  await scrollToShow(page.getByText("Network total").first(), 110);
  await hold(page, 1300);
  await scrollToShow(page.getByText("New accepted connections, in priority order."), 260);
  await hold(page, 900);
  const bars = page.getByText("New accepted connections, in priority order.").locator("xpath=../..");
  const unzoomBars = await zoomOn(bars);
  await glide(page, page.getByText(/3 pending/).first());
  await hold(page, 2200);
  unzoomBars();
  await hold(page, 500);
  end();

  // 2. Quick capture: a pasted LinkedIn search page becomes a list, schools and programs matched.
  await page.evaluate(async (h) => navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([h], { type: "text/html" }) })]), PASTED_RESULTS);
  await page.goto("/candidates");
  const box = page.getByLabel("Paste a LinkedIn search results page here");
  await expect(box).toBeVisible();
  await box.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 330, behavior: "instant" }));
  await hold(page, 400);
  begin("capture");
  await hold(page, 500);
  await glide(page, box);
  await box.click();
  await hold(page, 250);
  await page.keyboard.press("Control+V");
  await expect(page.getByLabel("School for Tara Singh")).toBeVisible();
  await hold(page, 500);
  await scrollToShow(page.getByText(/^5 found/).first(), 130);
  await hold(page, 800);
  const unzoomRows = await zoomOn(page.locator("li").filter({ has: page.getByLabel("School for Tara Singh") }).locator("xpath=.."));
  await hold(page, 1900);
  unzoomRows();
  const add = page.getByRole("button", { name: /^Add \d+ people$/ });
  await add.scrollIntoViewIfNeeded();
  await hold(page, 400);
  await glide(page, add);
  await add.click();
  await hold(page, 1300);
  end();

  // 3. Discover: plain language in, verified people with the receipts out.
  await page.goto("/discover");
  const ask = page.getByLabel("Who would you like to meet?");
  await expect(ask).toBeVisible();
  await hold(page, 300);
  begin("discover");
  await glide(page, ask);
  await ask.click();
  await ask.pressSequentially("Find 5 University of Toronto Computer Engineering alumni working as software engineers", { delay: 50 });
  await hold(page, 350);
  const find = page.getByRole("button", { name: "Find people" });
  await glide(page, find);
  await find.click();
  await page.waitForURL(/\/discover\/[0-9a-f-]{36}$/);
  const waitFrom = now();
  await expect(page.getByRole("heading", { name: "Research complete" })).toBeVisible({ timeout: 120_000 });
  const alex = page.getByRole("article", { name: "Alex Chen" });
  await expect(alex).toBeVisible({ timeout: 30_000 });
  await dropFixtureNotes(page);
  await hold(page, 300);
  scene!.fast.push([waitFrom, now(), 6]);
  await scrollToShow(page.getByRole("heading", { name: /verified match/ }), 100);
  await hold(page, 900);
  const unzoomAlex = await zoomOn(alex);
  await glide(page, alex.getByText("WHY THIS MATCHES", { exact: false }).first());
  await hold(page, 1700);
  unzoomAlex();
  const evidence = alex.getByRole("button", { name: "View evidence" });
  await glide(page, evidence);
  await evidence.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await hold(page, 500);
  const why = drawer.getByText(/Why they match/i).first();
  if (await why.isVisible().catch(() => false)) await why.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  await hold(page, 700);
  const unzoomDrawer = await zoomOn(drawer);
  await hold(page, 2300);
  unzoomDrawer();
  await hold(page, 300);
  await page.keyboard.press("Escape");
  await hold(page, 300);
  end();

  // 4. Jobs: verified postings, fit explained, compare.
  await page.goto("/jobs?q=Developer&range=any");
  const list = page.getByRole("region", { name: /jobs from/i }).getByRole("listitem");
  await expect(list.first()).toBeVisible();
  await dropFixtureNotes(page);
  await page.getByRole("heading", { name: /jobs from/i }).evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: "instant" }));
  await hold(page, 500);
  begin("jobs");
  await hold(page, 600);
  const unzoomJob = await zoomOn(list.nth(0));
  await glide(page, list.nth(0).getByText(/^Matches:/).first());
  await hold(page, 1900);
  unzoomJob();
  const first = list.nth(0).getByLabel(/^Compare /);
  const second = list.nth(1).getByLabel(/^Compare /);
  await glide(page, first);
  await first.check();
  await hold(page, 150);
  await glide(page, second);
  await second.check();
  await hold(page, 300);
  const bar = page.getByTestId("compare-bar").getByRole("link", { name: "Compare" });
  await glide(page, bar);
  await bar.click();
  await expect(page.getByRole("table", { name: "Jobs compared side by side" })).toBeVisible();
  await hold(page, 2200);
  end();

  // 5. Applications and follow-ups.
  await page.goto("/applications");
  await expect(page.getByText("Northwind Labs").first()).toBeVisible();
  await hold(page, 300);
  begin("applications");
  await glide(page, page.getByText("Pacific Data").first());
  await hold(page, 1600);
  const loadFrom = now();
  await page.goto("/follow-ups");
  await expect(page.getByTestId("follow-up").first()).toBeVisible();
  await hold(page, 200);
  scene!.fast.push([loadFrom, now(), 5]); // the page loading, run quickly
  await hold(page, 300);
  const unzoomFollow = await zoomOn(page.getByTestId("follow-up").first());
  await glide(page, page.getByTestId("follow-up").first().getByRole("button", { name: /copy/i }).first());
  await hold(page, 2200);
  unzoomFollow();
  await hold(page, 500);
  end();

  const desktopFrames = await capture.stop();
  await rec.close();

  // ---- The phone: the same account on a 390x844 screen, captured at 2x.
  const phone = await browser.newContext({ storageState, baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await tidy(phone);
  const m = await phone.newPage();
  await m.goto("/overview");
  await expect(m.getByRole("heading", { name: /overview/i }).first()).toBeVisible();
  await hold(m, 800);
  const shots = startShots(m, `${RAW}/phone`);
  await hold(m, 900);
  await m.evaluate(() => window.scrollBy({ top: 520, behavior: "smooth" }));
  await hold(m, 1300);
  await m.getByRole("button", { name: "Open menu" }).tap();
  await expect(m.getByRole("dialog", { name: "Network Growth" })).toBeVisible();
  await hold(m, 1100);
  await m.getByRole("dialog", { name: "Network Growth" }).getByRole("link", { name: "Jobs" }).tap();
  await m.waitForURL(/\/jobs/);
  await expect(m.getByRole("heading", { name: /jobs? from/i }).first()).toBeVisible();
  await expect(m.getByRole("region", { name: /jobs from/i }).getByRole("listitem").first()).toBeVisible();
  await dropFixtureNotes(m);
  await m.getByRole("heading", { name: /jobs? from/i }).first().evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" }));
  await hold(m, 1600);
  await m.evaluate(() => window.scrollBy({ top: 360, behavior: "smooth" }));
  await hold(m, 1300);
  const phoneSeconds = shots.now();
  const phoneFrames = await shots.stop();
  await phone.close();

  // ---- Hand the frames and the marks to scripts/docs/make-video.mjs.
  writeFileSync(
    `${RAW}/timeline.json`,
    JSON.stringify({ scenes, zooms, paths, desktop: { dir: "desktop", frames: desktopFrames }, phone: { dir: "phone", frames: phoneFrames, seconds: phoneSeconds } }, null, 1),
  );
  console.log(`captured: desktop ${scenes.at(-1)!.end}s in ${desktopFrames.length} frames, ${zooms.length} zooms; phone ${phoneSeconds}s in ${phoneFrames.length} frames`);
});
