#!/usr/bin/env node
/**
 * Smoke checks for a running deployment: the parts of "Smoke checks after each deploy" that need no
 * sign-in. Reads nothing and changes nothing, unless --cron is given (then it runs the cron routes
 * with CRON_SECRET, which does the real daily work).
 *
 *   npm run smoke -- https://your-app.vercel.app
 *   SMOKE_URL=https://staging.example.com CRON_SECRET=... npm run smoke -- --cron
 *
 * Exits 1 if any check fails. The signed-in checks (Overview, Save and Undo, dark mode, export) are
 * covered by the Playwright tests; run those against staging with E2E_BASE_URL.
 */
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const withCron = args.includes("--cron");

let failed = 0;
const pass = (name) => console.log(`ok    ${name}`);
const fail = (name, why) => {
  failed++;
  console.error(`FAIL  ${name}: ${why}`);
};

async function get(path, options = {}) {
  return fetch(base + path, { redirect: "manual", ...options });
}

async function check(name, fn) {
  try {
    const why = await fn();
    why ? fail(name, why) : pass(name);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

for (const [path, expectText] of [
  ["/", "Network Growth"],
  ["/login", "Continue with Google"],
  ["/guides", "Guides"],
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms"],
  ["/robots.txt", "User-Agent"],
  ["/llms.txt", "Network Growth Assistant"],
]) {
  await check(`${path} is public and mentions "${expectText}"`, async () => {
    const res = await get(path);
    if (res.status !== 200) return `status ${res.status}`;
    const body = await res.text();
    if (!body.toLowerCase().includes(expectText.toLowerCase())) return "expected text missing";
  });
}

await check("/sitemap.xml answers (empty is fine until APP_URL is set)", async () => {
  const res = await get("/sitemap.xml");
  if (res.status !== 200) return `status ${res.status}`;
});

await check("a signed-out visit to /overview is sent to /login", async () => {
  const res = await get("/overview");
  const where = res.headers.get("location") ?? "";
  if (res.status < 300 || res.status > 399 || !where.includes("/login")) return `status ${res.status}, location ${where || "none"}`;
});

await check("the data export refuses a signed-out request", async () => {
  const res = await get("/api/export");
  if (res.status !== 401) return `status ${res.status}`;
});

await check("cron routes refuse a request without the secret", async () => {
  for (const route of ["/api/cron/daily", "/api/cron/alerts"]) {
    const res = await get(route);
    if (res.status !== 401) return `${route} answered ${res.status}`;
  }
});

if (withCron) {
  const secret = process.env.CRON_SECRET;
  if (!secret) fail("cron routes with the secret", "set CRON_SECRET");
  else {
    for (const route of ["/api/cron/daily", "/api/cron/alerts"]) {
      await check(`${route} answers ok:true with the secret`, async () => {
        const res = await get(route, { headers: { Authorization: `Bearer ${secret}` } });
        const body = await res.json().catch(() => ({}));
        if (res.status !== 200 || body.ok !== true) return `status ${res.status}`;
      });
    }
  }
}

console.log(failed ? `\n${failed} check(s) failed against ${base}.` : `\nAll checks passed against ${base}.`);
process.exit(failed ? 1 : 0);
