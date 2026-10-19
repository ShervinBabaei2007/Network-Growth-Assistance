#!/usr/bin/env node
/**
 * Builds the banner at the top of README.md: docs/images/banner.svg (what GitHub shows) and banner.png (a copy for
 * social previews). Everything is drawn here, so nothing is fetched and the SVG is self-contained.
 *
 *   npm run docs:banner
 *
 * The mark shows what the app does: a person (your network) connected through a verified check (every fact is backed by a
 * source) to a briefcase (jobs). To change the technologies shown, edit STACK below. It should list what the repository
 * really uses; `package.json`, `supabase/` and `.github/` are the places to check.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const W = 1280;

/** Group, colour, and what is used in it. */
const STACK = [
  ["Frontend", "#60a5fa", ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS 4", "shadcn/ui", "Base UI", "Recharts", "cmdk", "Lucide"]],
  ["Backend", "#34d399", ["Supabase", "PostgreSQL", "Row-level security", "pgvector", "pg_cron", "Edge Functions", "Zod", "Nodemailer"]],
  ["Documents", "#fbbf24", ["React-PDF", "docx", "mammoth", "unpdf"]],
  ["AI and data", "#c084fc", ["Gemini", "Groq", "Mistral", "Claude", "GitHub API", "ORCID", "ROR", "Employer job boards"]],
  ["Quality and CI", "#fb923c", ["Vitest", "pgTAP", "Playwright", "axe-core", "ESLint", "Docker", "GitHub Actions", "Vercel", "Node.js 24"]],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ------------------------------------------------------------ the stack rows
const LABEL_W = 176;
const ROW_X = 90;
const CHIP_H = 34;
const GAP = 9;
const MAX_X = W - 90;
let y = 300;
let stack = "";
for (const [group, color, items] of STACK) {
  const widths = items.map((t) => 26 + Math.round(t.length * 7.5));
  // Wrap the chips into lines that fit beside the group label.
  const lines = [[]];
  let x = ROW_X + LABEL_W;
  items.forEach((t, i) => {
    if (x + widths[i] > MAX_X && lines.at(-1).length) {
      lines.push([]);
      x = ROW_X + LABEL_W;
    }
    lines.at(-1).push([t, widths[i], x]);
    x += widths[i] + GAP;
  });
  stack += `<circle cx="${ROW_X + 5}" cy="${y + CHIP_H / 2}" r="5" fill="${color}"/><text x="${ROW_X + 20}" y="${y + CHIP_H / 2 + 5}" font-size="14" font-weight="700" fill="#c7d7f0" letter-spacing="0.6">${esc(group.toUpperCase())}</text>`;
  for (const line of lines) {
    for (const [t, w, cx] of line) stack += `<rect x="${cx}" y="${y}" width="${w}" height="${CHIP_H}" rx="17" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.16"/><text x="${cx + w / 2}" y="${y + 22}" text-anchor="middle" font-size="14.5" font-weight="600" fill="#e6edf7">${esc(t)}</text>`;
    y += CHIP_H + GAP;
  }
  y += 6;
}
const H = y + 22;

// ------------------------------------------------------------------ the mark
// person -- verified check -- briefcase, on one connected line.
const mark = `<g transform="translate(70 62)">
  <line x1="64" y1="60" x2="97" y2="60" stroke="#60a5fa" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"/>
  <line x1="161" y1="60" x2="196" y2="60" stroke="#60a5fa" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"/>
  <!-- person: your network -->
  <circle cx="30" cy="60" r="34" fill="#ffffff" fill-opacity="0.08" stroke="#93c5fd" stroke-width="2.5"/>
  <circle cx="30" cy="51" r="9" fill="none" stroke="#e6edf7" stroke-width="3"/>
  <path d="M14 78c1-10 8-15 16-15s15 5 16 15" fill="none" stroke="#e6edf7" stroke-width="3" stroke-linecap="round"/>
  <!-- shield with a check: verified, every fact backed by a source -->
  <path d="M130 22l32 11v24c0 20-13 33-32 41-19-8-32-21-32-41V33z" fill="#2563eb" stroke="#bfdbfe" stroke-width="3" stroke-linejoin="round" transform="translate(-2 -2)"/>
  <path d="M114 58l11 11 20-22" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="translate(-2 -2)"/>
  <!-- briefcase: jobs -->
  <circle cx="230" cy="60" r="34" fill="#ffffff" fill-opacity="0.08" stroke="#93c5fd" stroke-width="2.5"/>
  <rect x="211" y="52" width="38" height="25" rx="5" fill="none" stroke="#e6edf7" stroke-width="3"/>
  <path d="M222 52v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5" fill="none" stroke="#e6edf7" stroke-width="3"/>
  <path d="M211 62h38" stroke="#e6edf7" stroke-width="3"/>
</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d" font-family="'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif">
<title id="t">Network Growth Assistant</title>
<desc id="d">Grow your professional network and run your job search from one calm, honest workspace. Built with ${STACK.map(([, , items]) => items.join(", ")).join("; ")}.</desc>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="0.55" stop-color="#112347"/><stop offset="1" stop-color="#17407a"/></linearGradient>
<radialGradient id="glow" cx="0.18" cy="0.14" r="0.6"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.35"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#ffffff" fill-opacity="0.07"/></pattern>
</defs>
<rect width="${W}" height="${H}" rx="22" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="22" fill="url(#dots)"/>
<rect width="${W}" height="${H}" rx="22" fill="url(#glow)"/>
${mark}
<text x="396" y="104" font-size="58" font-weight="800" fill="#ffffff" letter-spacing="-1">Network Growth Assistant</text>
<text x="398" y="148" font-size="23" fill="#c7d7f0">Grow your network and run your job search from one calm, honest workspace.</text>
<text x="398" y="186" font-size="17" fill="#8fb0e0" letter-spacing="0.3">Evidence-backed people search  ·  Verified jobs  ·  Application tracker  ·  Free to run</text>
<line x1="90" y1="238" x2="${W - 90}" y2="238" stroke="#ffffff" stroke-opacity="0.12"/>
<text x="${ROW_X}" y="276" font-size="13" font-weight="700" fill="#8fb0e0" letter-spacing="3">BUILT WITH</text>
${stack}
</svg>
`;

writeFileSync("docs/images/banner.svg", svg);
await sharp(Buffer.from(svg), { density: 144 }).png().toFile("docs/images/banner.png");
console.log(`docs/images/banner.svg (${(svg.length / 1024).toFixed(0)} KB, ${W}x${H}) and banner.png written, ${STACK.reduce((n, g) => n + g[2].length, 0)} technologies in ${STACK.length} groups`);
