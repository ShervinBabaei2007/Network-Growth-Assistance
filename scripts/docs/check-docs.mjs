#!/usr/bin/env node
/**
 * Keeps README.md and docs/*.md honest.
 *
 *   npm run docs:check            links, anchors, images, npm scripts, environment variables, migration and end-to-end counts
 *   npm run docs:check -- --full  also runs the unit tests to compare their count
 *
 * It fails (exit 1) on:
 *  - a relative link or image that points at a file that doesn't exist, or an #anchor that no heading or id provides;
 *  - `npm run <script>` where the script isn't in package.json;
 *  - an environment variable named in the docs that nothing in the code or .env.example uses;
 *  - a number of migrations, end-to-end tests or unit tests that differs from the repository.
 * It warns (exit 0) about variables in .env.example that no document mentions.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize, relative, sep } from "node:path";

const ROOT = process.cwd();
const full = process.argv.includes("--full");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const docs = ["README.md", ...readdirSync(join(ROOT, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`)];
const problems = [];
const warnings = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);

// ------------------------------------------------------------------ anchors
/** GitHub's heading slug: lower-case, drop everything but letters, digits, spaces, hyphens and underscores, spaces to hyphens. */
const slug = (heading) =>
  heading
    .replace(/<[^>]+>/g, "")
    .replace(/`/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .replace(/ /g, "-");

const anchorCache = new Map();
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const text = read(file).replace(/```[\s\S]*?```/g, "");
  const set = new Set();
  const seen = new Map();
  for (const m of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    let s = slug(m[1]);
    const n = seen.get(s) ?? 0;
    seen.set(s, n + 1);
    set.add(n ? `${s}-${n}` : s);
  }
  for (const m of text.matchAll(/<a\s+(?:[^>]*\s)?(?:id|name)="([^"]+)"/g)) set.add(m[1]);
  anchorCache.set(file, set);
  return set;
}

// -------------------------------------------------------- links and images
for (const file of docs) {
  const text = read(file).replace(/```[\s\S]*?```/g, "");
  const targets = [];
  for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) targets.push(m[1]);
  for (const m of text.matchAll(/(?:src|href)="([^"]+)"/g)) targets.push(m[1]);
  for (const target of targets) {
    if (/^(https?:|mailto:|tel:|data:)/i.test(target)) continue;
    const [pathPart, hash] = target.split("#");
    const resolved = pathPart ? normalize(join(dirname(file), pathPart)) : file;
    if (pathPart && !existsSync(join(ROOT, resolved))) {
      fail(file, `link to a file that doesn't exist: ${target}`);
      continue;
    }
    if (hash && resolved.endsWith(".md") && !anchorsOf(resolved.split(sep).join("/")).has(hash)) fail(file, `link to an anchor that doesn't exist: ${target}`);
  }
}

// ------------------------------------------------------------- npm scripts
const scripts = new Set(Object.keys(JSON.parse(read("package.json")).scripts));
for (const file of docs) {
  for (const m of read(file).matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) if (!scripts.has(m[1])) fail(file, `\`npm run ${m[1]}\` is not a script in package.json`);
}

// ------------------------------------------------------ environment variables
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "test-results", "playwright-report"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js|toml|yml|yaml|sql|sh|example|json)$/.test(name) || name.startsWith(".env")) out.push(p);
  }
  return out;
}
const usedInRepo = new Set();
for (const p of [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts")), ...walk(join(ROOT, "supabase")), ...walk(join(ROOT, "e2e")), join(ROOT, ".env.example"), join(ROOT, "playwright.config.ts"), join(ROOT, "vercel.json"), join(ROOT, ".github/workflows/ci.yml")]) {
  if (!existsSync(p)) continue;
  for (const m of readFileSync(p, "utf8").matchAll(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g)) usedInRepo.add(m[1]);
}
// Names that look like variables but are SQL, protocol or file names.
const NOT_VARIABLES = new Set(["NOT_NULL", "ON_DELETE", "UPDATE_ONLY", "NEXT_PUBLIC", "READ_ONLY", "API_KEY"]);
const documented = new Set();
for (const file of docs) {
  for (const m of read(file).matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g)) {
    documented.add(m[1]);
    if (!usedInRepo.has(m[1]) && !NOT_VARIABLES.has(m[1])) fail(file, `\`${m[1]}\` is named but nothing in the code or .env.example uses it`);
  }
}
for (const m of read(".env.example").matchAll(/^#?\s*([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)=/gm)) {
  if (!documented.has(m[1])) warnings.push(`.env.example has ${m[1]}, which no document mentions`);
}

// ----------------------------------------------------------------- counts
const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).length;
const e2e = Number(execSync("npx playwright test --list", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).match(/Total: (\d+) tests/)?.[1] ?? NaN);
// Each pgTAP file declares how many assertions it runs (plan(N)); `npm run test:db` fails if a file runs a different number.
const pgtap = readdirSync(join(ROOT, "supabase/tests"))
  .filter((f) => f.endsWith(".sql"))
  .reduce((sum, f) => sum + Number(readFileSync(join(ROOT, "supabase/tests", f), "utf8").match(/plan\((\d+)\)/)?.[1] ?? 0), 0);
let unit = NaN;
if (full) {
  const report = join(tmpdir(), `vitest-report-${process.pid}.json`);
  execSync(`npx vitest run --reporter=json --outputFile="${report}"`, { cwd: ROOT, stdio: "ignore" });
  unit = JSON.parse(readFileSync(report, "utf8")).numTotalTests;
  rmSync(report, { force: true });
}
const claimed = (re, text) => [...text.matchAll(re)].map((m) => Number(m[1].replace(/,/g, "")));
for (const file of docs) {
  const text = read(file);
  for (const n of claimed(/\b(\d+)\s+migrations?\b/gi, text)) if (n !== migrations) fail(file, `says ${n} migrations; the repository has ${migrations}`);
  for (const n of claimed(/\b(\d[\d,]*)\s+database tests?\b/gi, text)) if (n !== pgtap) fail(file, `says ${n} database tests; the pgTAP plans add up to ${pgtap}`);
  for (const n of claimed(/pgTAP-(\d+)%20passing/g, text)) if (n !== pgtap) fail(file, `badge says ${n} database tests; the pgTAP plans add up to ${pgtap}`);
  for (const n of claimed(/\b(\d[\d,]*)\s+end-to-end tests?\b/gi, text)) if (n !== e2e) fail(file, `says ${n} end-to-end tests; Playwright lists ${e2e}`);
  for (const n of claimed(/e2e-(\d+)%20passing/g, text)) if (n !== e2e) fail(file, `badge says ${n} end-to-end tests; Playwright lists ${e2e}`);
  if (full) {
    for (const n of claimed(/\b(\d[\d,]*)\s+unit tests?\b/gi, text)) if (n !== unit) fail(file, `says ${n} unit tests; Vitest runs ${unit}`);
    for (const n of claimed(/unit%20tests-(\d[\d,]*)%20passing/g, text)) if (n !== unit) fail(file, `badge says ${n} unit tests; Vitest runs ${unit}`);
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} in the documentation:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`Documentation OK: ${docs.length} files, ${migrations} migrations, ${pgtap} database tests, ${e2e} end-to-end tests${full ? `, ${unit} unit tests` : ""}. (${relative(ROOT, ROOT) || "."})`);
