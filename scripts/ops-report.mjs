#!/usr/bin/env node
/**
 * Prints real-user speed (the 75th percentile of each Core Web Vital per route) and recent errors from a running
 * deployment. The data holds no personal information.
 *
 *   CRON_SECRET=... npm run ops:report -- https://your-app.vercel.app
 *   CRON_SECRET=... npm run ops:report -- http://localhost:3000 --days=30
 */
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const days = Number(args.find((a) => a.startsWith("--days="))?.slice(7)) || 7;
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET to the deployment's cron secret.");
  process.exit(1);
}

const res = await fetch(`${base}/api/ops/monitoring?days=${days}`, { headers: { Authorization: `Bearer ${secret}` } });
if (!res.ok) {
  console.error(`The server answered ${res.status}.`);
  process.exit(1);
}
const { vitals, errors } = await res.json();

// Google's "good" limits at the 75th percentile.
const GOOD = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 };
const fmt = (metric, v) => (metric === "CLS" ? v.toFixed(3) : `${Math.round(v)} ms`);

console.log(`Real-user speed, last ${days} days (p75)\n`);
console.log("route".padEnd(28) + "device".padEnd(9) + "metric".padEnd(7) + "p75".padStart(10) + "  samples  poor%  verdict");
for (const v of vitals) {
  const verdict = v.p75 <= GOOD[v.metric] ? "good" : "needs work";
  console.log(v.route.padEnd(28) + v.device.padEnd(9) + v.metric.padEnd(7) + fmt(v.metric, v.p75).padStart(10) + String(v.samples).padStart(9) + String(v.poor_share).padStart(7) + "  " + verdict);
}
if (!vitals.length) console.log("(no measurements yet)");

console.log(`\nErrors (${errors.length} distinct, newest first)\n`);
for (const e of errors) {
  console.log(`${e.last_seen}  x${e.occurrences}  [${e.source}] ${e.route}  ${e.message}`);
  if (e.stack) console.log("   " + e.stack.split("\n").slice(0, 3).join("\n   "));
}
if (!errors.length) console.log("(none)");
