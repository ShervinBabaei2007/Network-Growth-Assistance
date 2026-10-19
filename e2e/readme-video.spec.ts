import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Records the raw footage for the 30-second tour at the top of README.md: `npm run docs:video`
 * (which also edits the footage into docs/media/demo.mp4 and docs/images/demo.gif).
 *
 * It uses the app's built-in example data and fictional job and people datasets only, in a recorded browser window with
 * a visible cursor and short captions. Nothing here is a test of behaviour; the other specs cover that.
 * Needs `npm run db:start`; the Playwright config starts the app with DISCOVERY_FIXTURES and JOBS_FIXTURES.
 */

const RAW = "test-results/readme-video";

/** Injected into every page of the recorded window: a cursor dot, a caption pill and a corner note. */
const OVERLAY = `
(() => {
  const Z = __ZOOM__;
  const css = document.createElement("style");
  css.textContent = \`
    html { zoom: __ZOOM__; }
    nextjs-portal { display: none !important; }
    [data-testid="sample-banner"], [data-testid="toast"], [data-slot="toast-region"] { display: none !important; }
    #rv-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -4px 0 0 -4px; pointer-events: none; transition: transform .08s linear; filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); left: 0; top: 0; }
    #rv-ripple { position: fixed; z-index: 2147483646; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; border: 3px solid #2563eb; pointer-events: none; opacity: 0; }
    #rv-ripple.go { animation: rv-ping .45s ease-out; }
    @keyframes rv-ping { from { opacity: .9; transform: scale(.3); } to { opacity: 0; transform: scale(1.6); } }
    #rv-cap { position: fixed; z-index: 2147483645; left: 50%; bottom: 26px; transform: translateX(-50%); max-width: 80vw; background: rgba(11,18,32,.92); color: #fff; font: 600 21px/1.3 'Segoe UI', system-ui, sans-serif; padding: 12px 24px; border-radius: 999px; box-shadow: 0 8px 28px rgba(0,0,0,.35); opacity: 0; transition: opacity .25s; white-space: nowrap; }
    #rv-cap.on { opacity: 1; }
    #rv-tag { position: fixed; z-index: 2147483645; right: 14px; bottom: 14px; background: rgba(255,255,255,.92); color: #334155; font: 600 12px 'Segoe UI', system-ui, sans-serif; padding: 5px 10px; border-radius: 8px; border: 1px solid #cbd5e1; }
  \`;
  const mount = () => {
    document.head.append(css);
    document.body.insertAdjacentHTML("beforeend", \`
      <svg id="rv-cursor" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L9.6 19z" fill="#111827" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <div id="rv-ripple"></div><div id="rv-cap"></div><div id="rv-tag">Fictional example data</div>\`);
    const cur = document.getElementById("rv-cursor"), rip = document.getElementById("rv-ripple");
    const at = (x, y) => { x /= Z; y /= Z; cur.style.transform = "translate(" + x + "px," + y + "px)"; rip.style.left = x + "px"; rip.style.top = y + "px"; };
    addEventListener("mousemove", (e) => at(e.clientX, e.clientY), true);
    addEventListener("mousedown", () => { rip.classList.remove("go"); void rip.offsetWidth; rip.classList.add("go"); }, true);
    const saved = sessionStorage.getItem("rv-pos");
    if (saved) { const [x, y] = saved.split(",").map(Number); at(x, y); }
    addEventListener("mousemove", (e) => sessionStorage.setItem("rv-pos", e.clientX + "," + e.clientY), true);
    window.__cap = (text) => { const c = document.getElementById("rv-cap"); if (!text) { c.classList.remove("on"); return; } c.textContent = text; c.classList.add("on"); };
  };
  if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);
})();
`;

/**
 * Screen capture straight from the browser, as numbered JPEG frames with their times (Page.startScreencast). Playwright's own
 * video recorder caps the picture at about 1 Mbps; this keeps full quality at the window's real size.
 */
async function startCapture(context: BrowserContext, page: Page, dir: string) {
  mkdirSync(dir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const frames: { t: number }[] = [];
  const writes: Promise<void>[] = [];
  let origin = 0;
  cdp.on("Page.screencastFrame", (f) => {
    const t = f.metadata.timestamp! * 1000;
    if (!origin) origin = t;
    const name = `${dir}/${String(frames.length).padStart(5, "0")}.jpg`;
    frames.push({ t: (t - origin) / 1000 });
    writes.push(Promise.resolve(writeFileSync(name, Buffer.from(f.data, "base64"))));
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const startedAt = Date.now();
  return {
    /** Seconds since the capture began, on the same clock as the cut markers. */
    now: () => Math.round((Date.now() - startedAt) / 100) / 10,
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await Promise.all(writes);
      return frames;
    },
  };
}

/** Screenshots taken back to back at a high pixel density, for the phone (a screencast frame can't be sharper than the window's CSS size). */
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
    now: () => Math.round((Date.now() - startedAt) / 100) / 10,
    async stop() {
      running = false;
      await loop;
      return frames;
    },
  };
}

async function glide(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
  await page.waitForTimeout(280);
}
const caption = (page: Page, text: string) => page.evaluate((t) => (window as unknown as { __cap?: (s: string) => void }).__cap?.(t), text);
const smoothScroll = (page: Page, by: number) => page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), by);

test("record the 30-second tour", async ({ browser }) => {
  test.setTimeout(420_000);
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });
  const baseURL = test.info().project.use.baseURL;

  // ---- Setup, not recorded: an account with example data, boards read and a resume imported.
  const setup = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL });
  const s = await setup.newPage();
  await signIn(s, `tour.${Date.now() % 100000}@example.test`, "/overview", { welcome: true });
  const wizard = s.getByTestId("onboarding-wizard");
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  await wizard.getByRole("button", { name: "Look around with example data" }).click();
  await expect(s.getByTestId("sample-banner")).toBeVisible();
  await s.getByRole("button", { name: /skip/i }).first().click({ timeout: 3000 }).catch(() => {});
  await s.goto("/jobs?q=Developer");
  await expect(s.getByRole("heading", { name: /jobs? from (the last|any date)/i })).toBeVisible();
  test.skip(!(await s.getByText("Showing fictional sample employers").isVisible().catch(() => false)), "Run the dev server with JOBS_FIXTURES=1 and DISCOVERY_FIXTURES=1");
  await s.goto("/jobs/employers");
  await s.getByRole("button", { name: "Read due boards now" }).click();
  await expect(s.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./).first()).toBeVisible({ timeout: 60_000 });
  await s.goto("/jobs/resume");
  await s.getByLabel("Your resume (PDF or Word)").setInputFiles("e2e/fixtures/sample-resume.pdf");
  await s.getByRole("button", { name: /^Import/ }).click();
  await expect(s.getByLabel("Full name")).toHaveValue("Alex Sample", { timeout: 30_000 });
  const storageState = await setup.storageState();
  await setup.close();

  // ---- The recorded window (desktop).
  // A real 1920x1080 window with the interface drawn 1.5x larger, so it reads like a 1280x720 one but is captured at full 1080p.
  const ZOOM = 1.5;
  const rec = await browser.newContext({ storageState, baseURL, viewport: { width: 1920, height: 1080 } });
  await rec.addInitScript(OVERLAY.replaceAll("__ZOOM__", String(ZOOM)));
  const page = await rec.newPage();
  const capture = await startCapture(rec, page, `${RAW}/desktop`);
  const now = capture.now;
  const fast: [number, number][] = [];
  const marks: Record<string, number> = {};

  // 1. Overview: honest progress.
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: /overview/i }).first()).toBeVisible();
  await page.waitForTimeout(600);
  marks.overviewStart = now();
  await caption(page, "Your network, tracked honestly: pending never counts");
  await page.mouse.move(960, 450, { steps: 8 });
  await page.waitForTimeout(1100);
  await smoothScroll(page, 360);
  await page.waitForTimeout(1000);
  await caption(page, "");
  marks.overviewEnd = now();

  // 2. Discover: plain language in, verified people with the receipts out.
  await page.goto("/discover");
  const ask = page.getByLabel("Who would you like to meet?");
  await expect(ask).toBeVisible();
  marks.discoverStart = now();
  await caption(page, "Discover: ask in plain language");
  await glide(page, ask);
  await ask.click();
  await ask.pressSequentially("Find 5 University of Toronto Computer Engineering alumni working as software engineers", { delay: 14 });
  await page.waitForTimeout(300);
  await caption(page, "It searches public sources and never visits LinkedIn");
  const find = page.getByRole("button", { name: "Find people" });
  await glide(page, find);
  await find.click();
  await page.waitForURL(/\/discover\/[0-9a-f-]{36}$/);
  const waitFrom = now();
  await expect(page.getByRole("heading", { name: "Research complete" })).toBeVisible({ timeout: 120_000 });
  fast.push([waitFrom, now()]);
  const alex = page.getByRole("article", { name: "Alex Chen" });
  await expect(alex).toBeVisible({ timeout: 30_000 });
  // The test dataset labels itself; edit only the text, so the page keeps working while it polls.
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.nodeValue?.includes(" (fixture: no canned answer)")) node.nodeValue = node.nodeValue.replace(" (fixture: no canned answer)", "");
  });
  await caption(page, "Every match shows why, with its source quoted");
  await page.evaluate(() => document.querySelector("[aria-labelledby=progress-heading]")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(500);
  await alex.scrollIntoViewIfNeeded();
  await glide(page, alex);
  await page.waitForTimeout(500);
  const evidence = alex.getByRole("button", { name: "View evidence" });
  await glide(page, evidence);
  await evidence.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(2200);
  await page.keyboard.press("Escape");
  await caption(page, "");
  marks.discoverEnd = now();

  // 3. Jobs: verified postings, fit explained, compare.
  await page.goto("/jobs?q=Developer&range=any");
  const list = page.getByRole("region", { name: /jobs from/i }).getByRole("listitem");
  await expect(list.first()).toBeVisible();
  marks.jobsStart = now();
  await caption(page, "Jobs: real postings, verified links, fit explained");
  await page.mouse.move(1050, 495, { steps: 8 });
  await page.waitForTimeout(1300);
  await smoothScroll(page, 260);
  await page.waitForTimeout(500);
  const first = list.nth(0).getByLabel(/^Compare /);
  const second = list.nth(1).getByLabel(/^Compare /);
  await caption(page, "Pick two to compare side by side");
  await glide(page, first);
  await first.check();
  await glide(page, second);
  await second.check();
  const bar = page.getByTestId("compare-bar").getByRole("link", { name: "Compare" });
  await glide(page, bar);
  await bar.click();
  await expect(page.getByRole("table", { name: "Jobs compared side by side" })).toBeVisible();
  await page.waitForTimeout(1600);
  await caption(page, "");
  marks.jobsEnd = now();

  // 4. Applications and follow-ups.
  await page.goto("/applications");
  await expect(page.getByRole("heading", { name: /applications/i }).first()).toBeVisible();
  await caption(page, "Track every application, saved to offer");
  await page.mouse.move(960, 540, { steps: 8 });
  await page.waitForTimeout(1300);
  await page.goto("/follow-ups");
  await expect(page.getByRole("heading", { name: "Follow-ups" }).first()).toBeVisible();
  await expect(page.getByTestId("follow-up").first()).toBeVisible();
  await caption(page, "Follow up after every acceptance. You send it yourself");
  await page.waitForTimeout(1500);
  await caption(page, "");
  marks.end = now();

  const desktopFrames = await capture.stop();
  await rec.close();

  // ---- The phone (a separate narrow capture, placed beside a caption in the edit).
  const phone = await browser.newContext({ storageState, baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await phone.addInitScript(OVERLAY.replaceAll("__ZOOM__", "1").replace("bottom: 26px;", "bottom: -200px;").replace("#rv-cursor {", "#rv-cursor { display: none !important;"));
  const m = await phone.newPage();
  m.on("console", (msg) => msg.type() === "error" && console.log("PHONE CONSOLE ERROR:", msg.text().slice(0, 400)));
  m.on("pageerror", (e) => console.log("PHONE PAGE ERROR:", String(e).slice(0, 400)));
  await m.goto("/overview");
  await expect(m.getByRole("heading", { name: /overview/i }).first()).toBeVisible();
  const shots = startShots(m, `${RAW}/phone`);
  await m.waitForTimeout(1100);
  await m.getByRole("button", { name: "Open menu" }).click();
  await expect(m.getByRole("dialog", { name: "Network Growth" })).toBeVisible();
  await m.waitForTimeout(900);
  await m.keyboard.press("Escape");
  await m.goto("/jobs?q=Developer&range=any");
  await expect(m.getByRole("region", { name: /jobs from/i }).getByRole("listitem").first()).toBeVisible();
  await m.waitForTimeout(1200);
  const phoneSeconds = shots.now();
  const phoneFrames = await shots.stop();
  await phone.close();

  // ---- Hand the frames and the cut list to scripts/docs/make-video.mjs.
  writeFileSync(`${RAW}/timeline.json`, JSON.stringify({ fast, marks, desktop: { dir: "desktop", frames: desktopFrames }, phone: { dir: "phone", frames: phoneFrames, seconds: phoneSeconds } }));
  console.log(`captured: desktop ${marks.end}s in ${desktopFrames.length} frames (fast-forward ${fast.map(([a, b]) => `${a}-${b}`).join(", ")}), phone ${phoneSeconds}s in ${phoneFrames.length} frames`);
});
