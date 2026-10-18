#!/usr/bin/env node
/**
 * After `next build`: compares each route's first-load JavaScript (uncompressed) with the sizes in
 * scripts/route-budgets.json and fails if a route grew by more than 5% (and at least 8 KB, so tiny
 * routes don't trip on noise). A route with no budget yet is reported but doesn't fail.
 *
 *   npm run build && npm run check:budget           check
 *   npm run build && npm run check:budget -- --update   accept the current sizes as the new budget
 *
 * Update the budget in the same change that deliberately adds JavaScript, and say why in the commit.
 */
import { readFileSync, writeFileSync } from "node:fs";

const STATS = ".next/diagnostics/route-bundle-stats.json";
const BUDGETS = "scripts/route-budgets.json";
const GROWTH = 0.05;
const MIN_BYTES = 8 * 1024;

const stats = JSON.parse(readFileSync(STATS, "utf8"));
const current = Object.fromEntries(stats.map((r) => [r.route, r.firstLoadUncompressedJsBytes]));

if (process.argv.includes("--update")) {
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BUDGETS, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(sorted).length} route budgets to ${BUDGETS}.`);
  process.exit(0);
}

const budgets = JSON.parse(readFileSync(BUDGETS, "utf8"));
const kb = (n) => `${Math.round(n / 1024)} KB`;
let failed = 0;
for (const [route, size] of Object.entries(current)) {
  const budget = budgets[route];
  if (budget === undefined) {
    console.log(`new   ${route.padEnd(28)} ${kb(size)} (no budget yet; run with --update)`);
    continue;
  }
  const over = size - budget;
  if (over > MIN_BYTES && over / budget > GROWTH) {
    failed++;
    console.error(`FAIL  ${route.padEnd(28)} ${kb(size)} vs budget ${kb(budget)} (+${((over / budget) * 100).toFixed(1)}%)`);
  }
}
if (failed) {
  console.error(`\n${failed} route(s) grew more than ${GROWTH * 100}%. Load the new code on demand, or update the budget on purpose.`);
  process.exit(1);
}
console.log(`Checked ${Object.keys(current).length} routes: none grew more than ${GROWTH * 100}% over its budget.`);
