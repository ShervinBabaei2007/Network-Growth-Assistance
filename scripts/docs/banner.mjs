#!/usr/bin/env node
/**
 * Builds the banner at the top of README.md, docs/images/banner.png (1280x720 drawn at 2x, so it is also the tour's title
 * card). It shows the app itself, from the framed README pictures, beside what it does and what it is built with.
 *
 *   npm run docs:screenshots   (the pictures it uses: docs/images/discover.png and mobile-jobs.png)
 *   npm run docs:banner
 *
 * To change the technologies shown, edit STACK below. It should list what the repository really uses; `package.json`,
 * `supabase/` and `.github/` are the places to check.
 */
import sharp from "sharp";
import { FONT } from "./frame.mjs";

const W = 1280;
const H = 720;
const S = 2; // drawn at 2x

/** Group, colour, and what is used in it. */
const STACK = [
  ["Frontend", "#60a5fa", ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS 4", "shadcn/ui"]],
  ["Backend", "#34d399", ["Supabase", "PostgreSQL", "pgvector", "Zod"]],
  ["AI", "#c084fc", ["Gemini", "Groq", "Mistral", "Claude"]],
  ["Testing and DevOps", "#fb923c", ["Vitest", "Playwright", "pgTAP", "GitHub Actions", "Docker", "Vercel"]],
];

const FEATURES = ["People worth meeting, every fact quoted from a public source", "Real jobs from employers' own boards, with fit explained", "Honest progress: a pending invitation never counts"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textWidth = (t, size) => [...t].reduce((w, c) => w + (/[A-Z0-9]/.test(c) ? 0.63 : /[ijl.,:/' ]/.test(c) ? 0.3 : 0.53), 0) * size;

// ------------------------------------------------------------- left column
const X = 68;
let left = "";

// The mark: a person (your network) connected through a verified check (every fact is backed by a source) to a briefcase (jobs).
left += `<g transform="translate(${X} 58) scale(0.5)">
  <line x1="64" y1="60" x2="97" y2="60" stroke="#60a5fa" stroke-opacity="0.7" stroke-width="4" stroke-linecap="round"/>
  <line x1="161" y1="60" x2="196" y2="60" stroke="#60a5fa" stroke-opacity="0.7" stroke-width="4" stroke-linecap="round"/>
  <circle cx="30" cy="60" r="34" fill="#ffffff" fill-opacity="0.08" stroke="#93c5fd" stroke-width="3"/>
  <circle cx="30" cy="51" r="9" fill="none" stroke="#e6edf7" stroke-width="3.5"/>
  <path d="M14 78c1-10 8-15 16-15s15 5 16 15" fill="none" stroke="#e6edf7" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M128 20l32 11v24c0 20-13 33-32 41-19-8-32-21-32-41V31z" fill="#2563eb" stroke="#bfdbfe" stroke-width="3" stroke-linejoin="round"/>
  <path d="M112 56l11 11 20-22" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="230" cy="60" r="34" fill="#ffffff" fill-opacity="0.08" stroke="#93c5fd" stroke-width="3"/>
  <rect x="211" y="52" width="38" height="25" rx="5" fill="none" stroke="#e6edf7" stroke-width="3.5"/>
  <path d="M222 52v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5" fill="none" stroke="#e6edf7" stroke-width="3.5"/>
  <path d="M211 62h38" stroke="#e6edf7" stroke-width="3.5"/>
</g>`;

left += `<text x="${X - 3}" y="186" font-size="60" font-weight="800" fill="#ffffff" letter-spacing="-1.8">Network Growth</text>
<text x="${X - 3}" y="252" font-size="60" font-weight="800" fill="url(#title)" letter-spacing="-1.8">Assistant</text>
<text x="${X}" y="298" font-size="21" fill="#c7d7f0">Grow your network and run your job search</text>
<text x="${X}" y="326" font-size="21" fill="#c7d7f0">from one calm, honest workspace.</text>`;

FEATURES.forEach((f, i) => {
  const y = 374 + i * 32;
  left += `<circle cx="${X + 10}" cy="${y - 6}" r="10" fill="#2563eb" fill-opacity="0.35" stroke="#60a5fa" stroke-width="1.2"/>
<path d="M${X + 5.5} ${y - 6}l3 3 6-6.5" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<text x="${X + 30}" y="${y}" font-size="16.5" fill="#e6edf7">${esc(f)}</text>`;
});

// Built with: one line per group, a small label above each.
let y = 494;
left += `<text x="${X}" y="${y}" font-size="11.5" font-weight="700" fill="#8fb0e0" letter-spacing="2.6">BUILT WITH</text>`;
y += 16;
const CHIP_H = 27;
for (const [group, color, items] of STACK) {
  let x = X;
  left += `<text x="${x}" y="${y + 18}" font-size="11" font-weight="700" fill="${color}" letter-spacing="1">${esc(group.toUpperCase())}</text>`;
  x = X + 146;
  for (const t of items) {
    const w = Math.round(textWidth(t, 13) + 20);
    left += `<rect x="${x}" y="${y}" width="${w}" height="${CHIP_H}" rx="${CHIP_H / 2}" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.16"/>
<text x="${x + w / 2}" y="${y + 18.3}" text-anchor="middle" font-size="13" font-weight="600" fill="#e6edf7">${esc(t)}</text>`;
    x += w + 6;
  }
  y += CHIP_H + 9;
}

// ------------------------------------------------------------------ page
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070d1a"/><stop offset="0.5" stop-color="#0e1f40"/><stop offset="1" stop-color="#16396e"/></linearGradient>
<radialGradient id="glow" cx="0.72" cy="0.38" r="0.55"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.42"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
<radialGradient id="glow2" cx="0.05" cy="0.0" r="0.5"><stop offset="0" stop-color="#60a5fa" stop-opacity="0.18"/><stop offset="1" stop-color="#60a5fa" stop-opacity="0"/></radialGradient>
<linearGradient id="title" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#93c5fd"/><stop offset="1" stop-color="#60a5fa"/></linearGradient>
<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#ffffff" fill-opacity="0.06"/></pattern>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#dots)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<rect width="${W}" height="${H}" fill="url(#glow2)"/>
${left}
</svg>`;

// ------------------------------------------------------- the app, framed
// Discover in its browser window, running off the right edge, and Jobs on a phone in front of it.
const win = await sharp("docs/images/discover.png").resize({ width: 820 * S }).toBuffer();
const phone = await sharp("docs/images/mobile-jobs.png").resize({ height: 470 * S }).toBuffer();
const winMeta = await sharp(win).metadata();
const winLeft = 716 * S;
const winTop = 64 * S;
// Crop what runs past the right and bottom edges.
const winCut = await sharp(win)
  .extract({ left: 0, top: 0, width: Math.min(winMeta.width, W * S - winLeft), height: Math.min(winMeta.height, H * S - winTop) })
  .toBuffer();
await sharp(Buffer.from(svg))
  .composite([
    { input: winCut, left: winLeft, top: winTop },
    { input: phone, left: 1046 * S, top: 236 * S },
  ])
  .png({ compressionLevel: 9 })
  .toFile("docs/images/banner.png");
console.log(`docs/images/banner.png (${W * S}x${H * S}), ${STACK.reduce((n, g) => n + g[2].length, 0)} technologies in ${STACK.length} groups`);
