#!/usr/bin/env node
/**
 * After `next build`: checks that no AI key, and no code that calls an AI service with a
 * key, ended up in the files sent to browsers (.next/static).
 *
 *   GEMINI_API_KEY=AIza-sentinel npm run build && GEMINI_API_KEY=AIza-sentinel node scripts/check-client-bundle.mjs
 *
 * With GEMINI_API_KEY (or ANTHROPIC_API_KEY) set, the value itself is searched for too.
 * Exits 1 and names the file if anything is found.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".next/static";
const needles = [
  "GEMINI_API_KEY",
  "NEXT_PUBLIC_GEMINI",
  "x-goog-api-key",
  "generativelanguage.googleapis.com",
  "ANTHROPIC_API_KEY",
  process.env.GEMINI_API_KEY,
  process.env.ANTHROPIC_API_KEY,
].filter((n) => typeof n === "string" && n.length >= 8);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|mjs|css|html|json|txt|map)$/.test(name)) yield path;
  }
}

let found = 0;
let scanned = 0;
for (const path of files(ROOT)) {
  scanned++;
  const text = readFileSync(path, "utf8");
  for (const n of needles) {
    if (text.includes(n)) {
      found++;
      const label = n === process.env.GEMINI_API_KEY || n === process.env.ANTHROPIC_API_KEY ? "an AI key's value" : `"${n}"`;
      console.error(`Found ${label} in ${path}`);
    }
  }
}
if (!scanned) {
  console.error(`No client files in ${ROOT}. Run \`npm run build\` first.`);
  process.exit(1);
}
if (found) process.exit(1);
console.log(`Checked ${scanned} client files: no AI keys or key-bearing AI calls.`);
