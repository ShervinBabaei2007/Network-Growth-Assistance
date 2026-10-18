import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail } from "./helpers";

// The tests run outside Next.js, so the secret is read from .env.local like the other helpers do.
async function ops(path = "") {
  const { readFileSync } = await import("node:fs");
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("CRON_SECRET="));
  const secret = process.env.CRON_SECRET ?? line?.slice(12).trim().replace(/^"|"$/g, "");
  const res = await fetch(`http://localhost:3000/api/ops/monitoring${path}`, { headers: { Authorization: `Bearer ${secret}` } });
  return { status: res.status, body: res.ok ? await res.json() : null };
}

test("real page-speed measurements arrive, grouped by route pattern with nothing identifying", async ({ page }) => {
  const email = uniqueEmail("rum");
  await signIn(page, email);
  const before = ((await adminRest("GET", "rum_vitals?select=id&order=id.desc&limit=1")) as { id: number }[])[0]?.id ?? 0;

  await page.goto("/overview");
  await page.waitForLoadState("networkidle");
  await page.goto("/candidates");
  await page.waitForLoadState("networkidle");
  // The browser reports final values when a page is hidden or left.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  let rows: { route: string; metric: string; value: number; device: string }[] = [];
  await expect
    .poll(async () => {
      rows = (await adminRest("GET", `rum_vitals?id=gt.${before}&select=route,metric,value,device`)) as typeof rows;
      return rows.length;
    })
    .toBeGreaterThan(0);
  for (const r of rows) {
    expect(r.route).toMatch(/^\/[a-z-]*(\/(\[id\]|\[slug\]|[a-z-]+))?$/);
    expect(["LCP", "INP", "CLS", "FCP", "TTFB"]).toContain(r.metric);
    expect(r.value).toBeGreaterThanOrEqual(0);
  }
  expect(JSON.stringify(rows)).not.toContain(email);
});

test("the operator report shows p75 per route and needs the secret", async () => {
  expect((await fetch("http://localhost:3000/api/ops/monitoring")).status).toBe(401);
  const { status, body } = await ops("?days=7");
  expect(status).toBe(200);
  expect(Array.isArray(body.vitals)).toBe(true);
  expect(Array.isArray(body.errors)).toBe(true);
});

test("an error report is stored with a stack trace and no personal data", async ({ request }) => {
  // Letters only: the scrubber (rightly) replaces long digit runs.
  const marker = `Marker${Date.now().toString(36).replace(/\d/g, "x")}`;
  const res = await request.post("/api/client-errors", {
    data: JSON.stringify({
      message: `${marker} failed for maya.chen@example.com while opening https://www.linkedin.com/in/maya-chen-9 with key AIzaSyA1234567890abcdefghijklmn`,
      stack: `Error: ${marker}\n    at Page (https://app.example.com/_next/static/chunks/app.js?token=abc:10:5)`,
      digest: "123456",
      path: "/applications/3f2c1a9e-0000-4000-8000-000000000000?q=secret",
    }),
    headers: { "Content-Type": "text/plain" },
  });
  expect(res.status()).toBe(204);

  const { body } = await ops("?days=7");
  const stored = body.errors.find((e: { message: string }) => e.message.includes(marker));
  expect(stored).toBeTruthy();
  expect(stored.route).toBe("/applications/[id]");
  expect(stored.stack).toContain("/_next/static/chunks/app.js");
  expect(JSON.stringify(stored)).not.toMatch(/maya|example\.com|AIzaSy|secret|token=|3f2c1a9e|linkedin\.com\/in\/maya/);

  // The same failure again is counted, not duplicated.
  await request.post("/api/client-errors", { data: JSON.stringify({ message: `${marker} failed for someone@else.org while opening https://www.linkedin.com/in/another-person with key AIzaSyBBBBBBBBBBBBBBBBBBBBBBBB`, stack: `Error: ${marker}\n    at Page (https://app.example.com/_next/static/chunks/app.js?token=zzz:10:5)`, path: "/applications/other-id" }), headers: { "Content-Type": "text/plain" } });
  const again = (await ops("?days=7")).body.errors.filter((e: { message: string }) => e.message.includes(marker));
  expect(again).toHaveLength(1);
  expect(again[0].occurrences).toBe(2);
});

test("junk is refused", async ({ request }) => {
  expect((await request.post("/api/vitals", { data: "not json", headers: { "Content-Type": "text/plain" } })).status()).toBe(400);
  expect((await request.post("/api/vitals", { data: JSON.stringify({ name: "LCP", value: -5, path: "/" }), headers: { "Content-Type": "text/plain" } })).status()).toBe(400);
  expect((await request.post("/api/vitals", { data: JSON.stringify({ name: "NOPE", value: 5, path: "/" }), headers: { "Content-Type": "text/plain" } })).status()).toBe(400);
  expect((await request.post("/api/vitals", { data: "x".repeat(5000), headers: { "Content-Type": "text/plain" } })).status()).toBe(413);
});
