#!/usr/bin/env node
/**
 * Builds the banner at the top of README.md: docs/images/banner.svg (what GitHub shows) and banner.png (a copy for
 * social previews). Logos come from the `simple-icons` package, so nothing is fetched and the SVG is self-contained.
 *
 *   npm run docs:banner
 *
 * To change the technologies shown, edit TECH below. Keep it to what the repository really uses.
 */
import { writeFileSync } from "node:fs";
import * as icons from "simple-icons";
import sharp from "sharp";

const W = 1280;
const H = 440;

/** [label, simple-icons export or null when that brand has no icon in the package, fallback colour] */
const TECH = [
  ["Next.js 16", "siNextdotjs", "#ffffff"],
  ["React 19", "siReact", null],
  ["TypeScript", "siTypescript", null],
  ["Tailwind CSS 4", "siTailwindcss", null],
  ["shadcn/ui", "siShadcnui", "#ffffff"],
  ["Supabase", "siSupabase", null],
  ["PostgreSQL", "siPostgresql", null],
  ["Vercel", "siVercel", "#ffffff"],
  ["Zod", "siZod", null],
  ["Vitest", "siVitest", null],
  ["Playwright", null, "#2ead33"],
  ["GitHub Actions", "siGithubactions", null],
  ["Gemini", "siGooglegemini", null],
  ["Groq", null, "#f55036"],
  ["Mistral AI", "siMistralai", null],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Brand colours that vanish on a dark background are drawn white. */
function readable(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 70 ? "#ffffff" : hex;
}

// Chips, wrapped into centred rows.
const CHIP_H = 44;
const GAP = 12;
const MAX_ROW = 1120;
const chips = TECH.map(([label, key, fallback]) => {
  const icon = key ? icons[key] : null;
  if (key && !icon) throw new Error(`simple-icons has no ${key}`);
  return { label, path: icon?.path ?? null, color: readable(icon ? `#${icon.hex}` : fallback), width: 18 + 24 + 9 + Math.round(label.length * 8.6) + 18 };
});
const rows = [[]];
let used = 0;
for (const chip of chips) {
  if (used + chip.width > MAX_ROW && rows.at(-1).length) {
    rows.push([]);
    used = 0;
  }
  rows.at(-1).push(chip);
  used += chip.width + GAP;
}
const top = 262;
const chipSvg = rows
  .map((row, r) => {
    const total = row.reduce((s, c) => s + c.width, 0) + GAP * (row.length - 1);
    let x = (W - total) / 2;
    const y = top + r * (CHIP_H + GAP);
    return row
      .map((c) => {
        const mark = c.path
          ? `<g transform="translate(${x + 18} ${y + 10}) scale(1)"><svg width="24" height="24" viewBox="0 0 24 24"><path d="${c.path}" fill="${c.color}"/></svg></g>`
          : `<g transform="translate(${x + 18} ${y + 10})"><rect width="24" height="24" rx="7" fill="${c.color}"/><text x="12" y="17.5" text-anchor="middle" font-size="15" font-weight="700" fill="#0b1220">${esc(c.label[0])}</text></g>`;
        const out = `<rect x="${x}" y="${y}" width="${c.width}" height="${CHIP_H}" rx="22" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.16"/>${mark}<text x="${x + 18 + 24 + 9}" y="${y + 28}" font-size="15" font-weight="600" fill="#e6edf7">${esc(c.label)}</text>`;
        x += c.width + GAP;
        return out;
      })
      .join("");
  })
  .join("");

// A small network graph as the mark.
const nodes = [
  [64, 70, 9], [108, 40, 6], [112, 96, 7], [30, 34, 5], [28, 104, 6], [150, 66, 5],
];
const links = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 5], [1, 3], [2, 4]];
const graph = `<g transform="translate(86 44)" stroke="#60a5fa" stroke-opacity="0.55" stroke-width="2">${links.map(([a, b]) => `<line x1="${nodes[a][0]}" y1="${nodes[a][1]}" x2="${nodes[b][0]}" y2="${nodes[b][1]}"/>`).join("")}</g>` +
  `<g transform="translate(86 44)">${nodes.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${i === 0 ? "#3b82f6" : "#93c5fd"}"${i === 0 ? ' stroke="#bfdbfe" stroke-width="3"' : ""}/>`).join("")}</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d" font-family="'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif">
<title id="t">Network Growth Assistant</title>
<desc id="d">Grow your professional network and run your job search from one calm, honest workspace. Built with Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Supabase, PostgreSQL, Vercel, Zod, Vitest, Playwright, GitHub Actions and free AI services.</desc>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="0.55" stop-color="#112347"/><stop offset="1" stop-color="#17407a"/></linearGradient>
<radialGradient id="glow" cx="0.18" cy="0.2" r="0.6"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.35"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#ffffff" fill-opacity="0.07"/></pattern>
</defs>
<rect width="${W}" height="${H}" rx="22" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="22" fill="url(#dots)"/>
<rect width="${W}" height="${H}" rx="22" fill="url(#glow)"/>
${graph}
<text x="270" y="102" font-size="58" font-weight="800" fill="#ffffff" letter-spacing="-1">Network Growth Assistant</text>
<text x="272" y="146" font-size="23" fill="#c7d7f0">Grow your network and run your job search from one calm, honest workspace.</text>
<text x="272" y="186" font-size="17" fill="#8fb0e0" letter-spacing="0.3">Evidence-backed people search  ·  Verified jobs  ·  Application tracker  ·  Free to run</text>
<line x1="86" y1="222" x2="${W - 86}" y2="222" stroke="#ffffff" stroke-opacity="0.12"/>
<text x="${W / 2}" y="250" text-anchor="middle" font-size="13" font-weight="700" fill="#8fb0e0" letter-spacing="3">BUILT WITH</text>
${chipSvg}
</svg>
`;

writeFileSync("docs/images/banner.svg", svg);
await sharp(Buffer.from(svg)).png().toFile("docs/images/banner.png");
console.log(`docs/images/banner.svg (${(svg.length / 1024).toFixed(0)} KB) and banner.png written, ${chips.length} technologies in ${rows.length} rows`);
