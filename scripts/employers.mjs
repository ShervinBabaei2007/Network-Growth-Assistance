#!/usr/bin/env node
/**
 * The shared employer directory's seed list.
 *
 *   node scripts/employers.mjs discover [file]   Probe each candidate name (from file, default
 *                                         scripts/employer-candidates.txt) on the public job-board
 *                                         APIs and add the boards that answer to
 *                                         supabase/seed/employers.json (boards already there are kept).
 *
 * Candidate lines: "Name" (its slug is tried on each board), "Name | token" (that token), or for
 * Workday: "Name | wd" (find the site from the name), "Name | wd:tenant" (from a tenant guess),
 * "Name | tenant.wd3.Site" (that site) or "Name | https://careers.example.com" (the Workday site
 * the careers page links to).
 *   node scripts/employers.mjs load       Upsert supabase/seed/employers.json into the database
 *                                         (reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY
 *                                         from the environment or .env.local).
 *
 * Only official, unauthenticated board APIs are called, one request per guess, a few at a time.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SEED = "supabase/seed/employers.json";
const CANDIDATES = process.argv[3] ?? "scripts/employer-candidates.txt";
const UA = "NetworkGrowthAssistant/1.0 (+personal job search; reads public job-board APIs)";

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
    const all = await get(`https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=1`);
    if (!all || !(all.totalFound > 0)) return null;
    const ca = await get(`https://api.smartrecruiters.com/v1/companies/${t}/postings?country=ca&limit=1`);
    return { total: all.totalFound, canada: ca?.totalFound ?? 0, url: `https://careers.smartrecruiters.com/${t}` };
  },
  workable: async (t) => {
    const r = await get(`https://apply.workable.com/api/v1/widget/accounts/${t}`);
    return Array.isArray(r?.jobs) ? { total: r.jobs.length, canada: r.jobs.filter((j) => j.country === "Canada" || CANADA.test(`${j.city ?? ""}, ${j.state ?? ""}`)).length, url: `https://apply.workable.com/${t}/` } : null;
  },
  recruitee: async (t) => {
    const r = await get(`https://${t}.recruitee.com/api/offers/`);
    return Array.isArray(r?.offers) ? { total: r.offers.length, canada: r.offers.filter((j) => CANADA.test(`${j.location ?? ""} ${j.country ?? ""}`)).length, url: `https://${t}.recruitee.com/` } : null;
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

// ------------------------------------------------------------------ Workday
// Career sites at {tenant}.wd{N}.myworkdayjobs.com/{site}; the board token is "tenant.wdN.site".
// The same public API answers 422 when the tenant isn't on that server, 404 (Job_Posting_Site_ID)
// when the tenant is there but the site name is wrong, and 200 for the site itself.

const WD_PODS = ["wd3", "wd1", "wd5", "wd10", "wd12", "wd101", "wd103", "wd105", "wd108", "wd501", "wd503"];
const WD_LINK = /https?:\/\/([a-z0-9_-]+)\.(wd\d{1,3})\.myworkdayjobs\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?([A-Za-z0-9_-]{1,80})/gi;
const NOT_WD_SITES = new Set(["job", "jobs", "wday", "login", "details"]);

async function wdPost(tenant, pod, site) {
  try {
    const res = await fetch(`https://${tenant}.${pod}.myworkdayjobs.com/wday/cxs/${tenant}/${encodeURIComponent(site)}/jobs`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
      signal: AbortSignal.timeout(20_000),
    });
    return { status: res.status, body: res.ok ? await res.json() : null };
  } catch {
    return { status: 0, body: null };
  }
}

/** Jobs in Canada, from the board's country facet (wherever it's nested). */
function wdCanada(facets) {
  let n = 0;
  const walk = (list) => {
    for (const f of list ?? []) {
      if (/^canada$/i.test(f.descriptor ?? "") && typeof f.count === "number") n = Math.max(n, f.count);
      walk(f.values);
    }
  };
  walk(facets);
  return n;
}

const probeWorkday = async (token) => {
  const m = /^([A-Za-z0-9_-]+)\.(wd\d{1,3})\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return null;
  const r = await wdPost(m[1], m[2], m[3]);
  return r.status === 200 && r.body?.total > 0 ? { total: r.body.total, canada: wdCanada(r.body.facets), url: `https://${m[1]}.${m[2]}.myworkdayjobs.com/${m[3]}` } : null;
};

/** Site names employers commonly give their Workday career site, for a tenant. */
function wdSiteGuesses(tenant) {
  const forms = [...new Set([tenant, tenant.toUpperCase(), tenant[0].toUpperCase() + tenant.slice(1)])];
  return [
    ...["External", "Careers", "careers", "career", "External_Careers", "ExternalCareers", "External_Career_Site", "ExternalCareerSite", "External_Site", "Search", "search", "Jobs", "jobs", "Global", "Careers_External", "Experienced", "Corporate", "Staff", "en-US"],
    ...forms.flatMap((t) => [t, `${t}_Careers`, `${t}_careers`, `${t}Careers`, `${t}careers`, `${t}_External`, `${t}External`, `${t}_Career`, `${t}-Careers`, `${t}_External_Careers`, `${t}_External_Career_Site`, `${t}_Jobs`, `${t}Global`, `${t}_Global`]),
  ];
}

/** Finds a tenant's server, then its career site among the usual names. One request per guess. */
async function guessWorkday(tenant) {
  for (const pod of WD_PODS) {
    const first = await wdPost(tenant, pod, "External");
    if (first.status === 422 || first.status === 0) continue;
    if (first.status === 200) return `${tenant}.${pod}.External`;
    for (const site of wdSiteGuesses(tenant).slice(1)) {
      const r = await wdPost(tenant, pod, site);
      if (r.status === 200) return `${tenant}.${pod}.${site}`;
    }
    return null;
  }
  return null;
}

/** Workday sites a careers page links to ("tenant.wdN.site"), most-linked first. */
async function workdayLinksOn(pageUrl) {
  try {
    const res = await fetch(pageUrl, { headers: { Accept: "text/html", "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const direct = [...`${res.url} `.matchAll(WD_LINK)];
    const html = res.ok ? await res.text() : "";
    const counts = new Map();
    for (const m of [...direct, ...html.matchAll(WD_LINK)]) {
      if (NOT_WD_SITES.has(m[3].toLowerCase())) continue;
      const t = `${m[1].toLowerCase()}.${m[2].toLowerCase()}.${m[3]}`;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  } catch {
    return [];
  }
}

/**
 * Workday candidates for one line: an explicit token, the sites a careers URL leads to, or
 * guesses from "wd" / "wd:tenant1,tenant2" hints (the name's own slug when no tenant is given).
 */
async function workdayTokensFor(name, explicit) {
  if (/^[A-Za-z0-9_-]+\.wd\d{1,3}\.[A-Za-z0-9_-]+$/.test(explicit)) return [explicit];
  if (/^https?:\/\//i.test(explicit)) return (await workdayLinksOn(explicit)).slice(0, 3);
  const hint = /^wd(?::(.+))?$/i.exec(explicit);
  if (!hint) return [];
  const tenants = hint[1] ? hint[1].split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : slugs(name).map((s) => s.replace(/-/g, ""));
  for (const t of [...new Set(tenants)]) {
    const token = await guessWorkday(t);
    if (token) return [token];
  }
  return [];
}

/** Workday candidates from a line's hints, tried in order until one finds a site. */
async function workdayTokens(name, hints) {
  for (const h of hints) {
    const found = await workdayTokensFor(name, h);
    if (found.length) return found;
  }
  return [];
}

const isWorkdayHint = (h) => /^(wd(:|$)|https?:\/\/)/i.test(h) || /\.wd\d/.test(h);

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
      const [name, ...hints] = line.split("|").map((s) => s.trim()).filter(Boolean);
      const explicit = hints[0];
      let best = null;
      // Workday lines ("wd", "wd:tenant", a Workday token or a careers URL) are probed on Workday only.
      const workdayLine = hints.length > 0 && hints.every(isWorkdayHint);
      const wd = workdayLine ? await workdayTokens(name, hints) : [];
      for (const token of wd) {
        const r = await probeWorkday(token);
        if (r && (!best || r.total > best.total)) best = { name, ats: "workday", token, careers_url: r.url, canada: r.canada, total: r.total };
      }
      const tokens = workdayLine ? [] : explicit ? [explicit] : slugs(name);
      for (const [ats, probe] of workdayLine ? [] : Object.entries(probes)) {
        for (const token of ats === "smartrecruiters" ? [...tokens, name.replace(/[^A-Za-z0-9]/g, "")] : tokens) {
          const r = await probe(token);
          // The board with the most jobs wins (worldwide); Canadian jobs are counted for the log only.
          if (r && r.total > 0 && (!best || r.total > best.total)) best = { name, ats, token, careers_url: r.url, canada: r.canada, total: r.total };
        }
      }
      if (best) {
        found.push(best);
        console.log(`✓ ${name}: ${best.ats}/${best.token} (${best.total} jobs, ${best.canada} in Canada)`);
      } else console.log(`✗ ${name}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  // Boards already in the seed stay (a probe can fail for a moment); new ones are added.
  const previous = existsSync(SEED) ? JSON.parse(readFileSync(SEED, "utf8")).map((e) => ({ ...e, canada: 0, total: 0 })) : [];
  // One entry per board (a name listed twice finds the same board).
  const unique = [...new Map([...previous, ...found].map((f) => [`${f.ats}/${f.token.toLowerCase()}`, f])).values()];
  found.length = 0;
  found.push(...unique);
  found.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  writeFileSync(SEED, `${JSON.stringify(found.map(({ name, ats, token, careers_url }) => ({ name, ats, token, careers_url })), null, 2)}\n`);
  console.log(`\n${found.length} boards in ${SEED} (${unique.length - previous.length} new)`);
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
