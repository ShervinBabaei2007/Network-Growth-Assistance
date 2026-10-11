#!/usr/bin/env node
/**
 * The shared employer directory's seed list.
 *
 *   node scripts/employers.mjs discover   Probe each candidate name on the public job-board
 *                                         APIs and write supabase/seed/employers.json with the
 *                                         boards that answer (and how many Canadian jobs each has).
 *   node scripts/employers.mjs load       Upsert supabase/seed/employers.json into the database
 *                                         (reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY
 *                                         from the environment or .env.local).
 *
 * Only official, unauthenticated board APIs are called, one request per guess, a few at a time.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SEED = "supabase/seed/employers.json";
const CANDIDATES = "scripts/employer-candidates.txt";
const UA = "NetworkGrowthAssistant/1.0 (+job search for Canadians; reads public job-board APIs)";

const CANADA = /\b(canada|british columbia|ontario|alberta|quebec|manitoba|saskatchewan|nova scotia|new brunswick|toronto|vancouver|burnaby|surrey|richmond, bc|victoria, bc|kelowna|waterloo|kitchener|ottawa|mississauga|markham|montreal|calgary|edmonton|winnipeg|halifax|(,|\s-)\s*(bc|on|ab|qc|mb|sk|ns|nb)\b)/i;

const probes = {
  greenhouse: async (t) => {
    const r = await get(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs`);
    return r?.jobs ? { total: r.jobs.length, canada: r.jobs.filter((j) => CANADA.test(j.location?.name ?? "")).length, url: `https://boards.greenhouse.io/${t}` } : null;
  },
  lever: async (t) => {
    const r = await get(`https://api.lever.co/v0/postings/${t}?mode=json`);
    return Array.isArray(r) ? { total: r.length, canada: r.filter((j) => j.country === "CA" || CANADA.test((j.categories?.allLocations ?? [j.categories?.location]).join("; "))).length, url: `https://jobs.lever.co/${t}` } : null;
  },
  ashby: async (t) => {
    const r = await get(`https://api.ashbyhq.com/posting-api/job-board/${t}`);
    const where = (j) => [j.location, j.address?.postalAddress?.addressCountry, ...(j.secondaryLocations ?? []).map((l) => `${l.location} ${l.address?.postalAddress?.addressCountry ?? ""}`)].join("; ");
    return r?.jobs ? { total: r.jobs.length, canada: r.jobs.filter((j) => CANADA.test(where(j))).length, url: `https://jobs.ashbyhq.com/${t}` } : null;
  },
  smartrecruiters: async (t) => {
    const r = await get(`https://api.smartrecruiters.com/v1/companies/${t}/postings?country=ca&limit=1`);
    return r && r.totalFound > 0 ? { total: r.totalFound, canada: r.totalFound, url: `https://careers.smartrecruiters.com/${t}` } : null;
  },
};

async function get(url) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** "Clio" → ["clio"]; "Fresh Prints" → ["freshprints", "fresh-prints"]; an explicit "Name | token" is used as given. */
function slugs(name) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").trim();
  return [...new Set([base.replace(/\s+/g, ""), base.replace(/\s+/g, "-")])].filter(Boolean);
}

async function discover() {
  const lines = readFileSync(CANDIDATES, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const found = [];
  let i = 0;
  const worker = async () => {
    while (i < lines.length) {
      const line = lines[i++];
      const [name, explicit] = line.split("|").map((s) => s.trim());
      const tokens = explicit ? [explicit] : slugs(name);
      let best = null;
      for (const [ats, probe] of Object.entries(probes)) {
        for (const token of ats === "smartrecruiters" ? [...tokens, name.replace(/[^A-Za-z0-9]/g, "")] : tokens) {
          const r = await probe(token);
          if (r && r.total > 0 && (!best || r.canada > best.canada)) best = { name, ats, token, careers_url: r.url, canada: r.canada, total: r.total };
        }
      }
      if (best) {
        found.push(best);
        console.log(`${best.canada > 0 ? "✓" : "·"} ${name}: ${best.ats}/${best.token} (${best.canada} in Canada of ${best.total})`);
      } else console.log(`✗ ${name}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  // One entry per board (a name listed twice finds the same board).
  const unique = [...new Map(found.map((f) => [`${f.ats}/${f.token.toLowerCase()}`, f])).values()];
  found.length = 0;
  found.push(...unique);
  // Employers with no Canadian jobs right now are kept: they hire in Canada from time to time.
  found.sort((a, b) => b.canada - a.canada || a.name.localeCompare(b.name));
  writeFileSync(SEED, `${JSON.stringify(found.map(({ name, ats, token, careers_url }) => ({ name, ats, token, careers_url })), null, 2)}\n`);
  console.log(`\n${found.length} boards found (${found.filter((f) => f.canada > 0).length} with jobs in Canada now) → ${SEED}`);
}

function env(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env.local")) return undefined;
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

async function load() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SECRET_KEY");
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
  const rows = JSON.parse(readFileSync(SEED, "utf8")).map((e) => ({ name: e.name, ats: e.ats, board_token: e.token, careers_url: e.careers_url }));
  for (let i = 0; i < rows.length; i += 200) {
    const res = await fetch(`${url}/rest/v1/employers?on_conflict=ats,board_token`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
    if (!res.ok) throw new Error(`Load failed: ${res.status} ${await res.text()}`);
  }
  console.log(`Loaded ${rows.length} employers (existing ones left as they are).`);
}

const cmd = process.argv[2];
if (cmd === "discover") await discover();
else if (cmd === "load") await load();
else console.log("Usage: node scripts/employers.mjs discover|load");
