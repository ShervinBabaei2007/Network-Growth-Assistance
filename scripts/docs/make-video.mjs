#!/usr/bin/env node
/**
 * Makes the tour at the top of README.md:
 *
 *   npm run db:start
 *   npm run docs:video              record the app (Playwright), edit it, write the files
 *   npm run docs:video -- --edit    re-edit the footage already recorded, without recording again
 *
 * Writes docs/media/demo.mp4 (1920x1080, the full-quality video) and docs/images/demo.webp (a silent, looping 1280x720
 * preview that plays inside the README; GitHub cannot play a video from the repository, but it shows animated WebP).
 *
 * The footage is the app with fictional data, captured frame by frame by e2e/readme-video.spec.ts. Every frame of the
 * video is composed here: a chapter title above the app in a browser window, eased zooms on the marked parts, a phone,
 * and crossfades between chapters. The title card is the README banner (npm run docs:banner). ffmpeg comes from the
 * `ffmpeg-static` package, so nothing needs installing on the machine.
 */
import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import sharp from "sharp";
import { FONT, HOST, phoned, titleBar } from "./frame.mjs";

const require = createRequire(import.meta.url);
const ffmpeg = (() => {
  try {
    const p = require("ffmpeg-static");
    if (p && existsSync(p)) return p;
  } catch {
    // fall through
  }
  console.error("ffmpeg-static isn't installed (it is an optional dev dependency). Run `npm install` first.");
  process.exit(1);
})();

const RAW = "test-results/readme-video";
const W = 1920;
const H = 1080;
const FPS = 30;
const FADE = 12; // crossfade between chapters, in frames
const mb = (p) => (statSync(p).size / 1024 / 1024).toFixed(1);

// ------------------------------------------------------------------ record
if (!process.argv.includes("--edit")) {
  console.log("Recording the tour (Playwright, fictional data)…");
  execSync("npx playwright test -c playwright.video.config.ts", { stdio: "inherit" });
}
if (!existsSync(`${RAW}/timeline.json`)) throw new Error(`Missing ${RAW}/timeline.json: record first (npm run docs:video).`);
if (!existsSync("docs/images/banner.png")) throw new Error("Missing docs/images/banner.png: run npm run docs:banner first.");
const { scenes, zooms, paths, desktop, phone } = JSON.parse(readFileSync(`${RAW}/timeline.json`, "utf8"));
mkdirSync("docs/media", { recursive: true });

// ------------------------------------------------------------------ layout
// The app's window: 16:9 content under a title bar, centred below the chapter title.
const TOP = 172;
const BOTTOM = 34;
const K = (H - TOP - BOTTOM) / 760; // CSS pixels of a 1280x720 page → video pixels (720 content + 40 bar)
const CW = Math.round(1280 * K);
const CH = Math.round(720 * K);
const BAR = Math.round(40 * K);
const CX = Math.round((W - CW) / 2);
const CY = TOP + BAR;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CHAPTERS = {
  overview: ["Honest progress", "Only accepted invitations count toward your targets. Pending ones are shown apart."],
  capture: ["Quick capture", "Paste a LinkedIn search page: schools and programs are matched to your own lists."],
  discover: ["Discover people worth meeting", "Ask in plain language. Every fact quotes the public page it came from."],
  jobs: ["Real jobs, fit explained", "Postings from employers' own boards, checked against your resume. Compare side by side."],
  applications: ["Applications and follow-ups", "Every application from saved to offer, and a follow-up after each acceptance."],
  phone: ["On your phone too", "Lists become cards and the menu tucks away. Same account, same data."],
};
/** Playback speed of each chapter (the waiting for research results is fast-forwarded separately). */
const SPEED = { overview: 1.2, capture: 1.2, discover: 1.3, jobs: 1.2, applications: 1.2, phone: 1.1 };
const ORDER = [...scenes.map((s) => s.id), "phone"];

const BG = `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070d1a"/><stop offset="0.5" stop-color="#0e1f40"/><stop offset="1" stop-color="#16396e"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.62" r="0.62"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.3"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#ffffff" fill-opacity="0.05"/></pattern>
<filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="22"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#dots)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>`;

function header(id) {
  const n = ORDER.indexOf(id) + 1;
  const [title, sub] = CHAPTERS[id];
  return `<rect x="${CX}" y="64" width="62" height="36" rx="18" fill="#2563eb" fill-opacity="0.28" stroke="#60a5fa" stroke-opacity="0.8" stroke-width="1.5"/>
<text x="${CX + 31}" y="89" text-anchor="middle" font-size="19" font-weight="700" fill="#dbeafe">${String(n).padStart(2, "0")}</text>
<text x="${CX + 80}" y="96" font-size="40" font-weight="800" fill="#ffffff" letter-spacing="-0.6">${esc(title)}</text>
<text x="${CX}" y="142" font-size="23" fill="#c7d7f0">${esc(sub)}</text>
<text x="${CX + CW}" y="92" text-anchor="end" font-size="16" fill="#8fb0e0">Fictional example data</text>`;
}

const rawCache = new Map();
/** A rendered background (raw RGB) for a chapter: title, and for desktop chapters the window with its address. */
async function background(id, path) {
  const key = `${id}|${path}`;
  if (!rawCache.has(key)) {
    const win =
      path === undefined
        ? ""
        : `<rect x="${CX}" y="${TOP + 16}" width="${CW}" height="${CH + BAR}" rx="14" fill="#000" fill-opacity="0.55" filter="url(#sh)"/>
<rect x="${CX - 1}" y="${TOP - 1}" width="${CW + 2}" height="${CH + BAR + 2}" rx="${12 * K + 1}" fill="#334155"/>
<rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" fill="#f4f7fb"/>
<g transform="translate(${CX} ${TOP})">${titleBar(CW, K, path)}</g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="${FONT}">${BG}${win}${header(id)}</svg>`;
    rawCache.set(key, sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer());
  }
  return rawCache.get(key);
}

// The content's bottom corners are rounded to match the window.
const R = Math.round(12 * K);
const cornerMask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}"><path d="M0 0H${CW}V${CH - R}a${R} ${R} 0 0 1 -${R} ${R}H${R}a${R} ${R} 0 0 1 -${R} -${R}z" fill="#fff"/></svg>`))
  .png()
  .toBuffer();

// ------------------------------------------------------------ source frames
const frameAt = (frames, t) => {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};
const decoded = new Map();
function decode(dir, i) {
  const key = `${dir}/${i}`;
  if (!decoded.has(key)) {
    if (decoded.size > 40) decoded.delete(decoded.keys().next().value);
    decoded.set(key, sharp(`${RAW}/${dir}/${String(i).padStart(5, "0")}.jpg`).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  return decoded.get(key);
}

// ------------------------------------------------------------------- zooms
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const RAMP = 0.6;
const MAX_ZOOM = 1.55;
/** The camera at a moment of the desktop footage: how far in, and where. */
function camera(t) {
  let best = { z: 1, x: W / 2, y: H / 2 };
  for (const zm of zooms) {
    const w = ease((t - zm.start) / RAMP) * (1 - ease((t - zm.end) / RAMP));
    if (w <= 0) continue;
    const { x, y, width, height } = zm.rect;
    const target = Math.max(1, Math.min(MAX_ZOOM, W / (width * 1.1), H / (Math.min(height, H / 1.2) * 1.1)));
    const viewH = H / target;
    const cx = x + width / 2;
    const cy = height * 1.1 > viewH ? y + viewH / 2 - 20 : y + height / 2; // a tall target is shown from its top
    const z = 1 + (target - 1) * w;
    if (z > best.z) best = { z, x: W / 2 + (cx - W / 2) * w, y: H / 2 + (cy - H / 2) * w };
  }
  return best;
}

async function desktopFrame(id, t) {
  const i = frameAt(desktop.frames, t);
  const { data, info } = await decode(desktop.dir, i);
  const cam = camera(t);
  const cw = Math.round(W / cam.z);
  const ch = Math.round(H / cam.z);
  const left = Math.max(0, Math.min(info.width - cw, Math.round(cam.x - cw / 2)));
  const top = Math.max(0, Math.min(info.height - ch, Math.round(cam.y - ch / 2)));
  const content = await sharp(data, { raw: info })
    .extract({ left, top, width: Math.min(cw, info.width), height: Math.min(ch, info.height) })
    .resize(CW, CH, { kernel: "lanczos3" })
    .ensureAlpha()
    .composite([{ input: cornerMask, blend: "dest-in" }])
    .raw()
    .toBuffer();
  const path = paths.filter((p) => p.t <= t).at(-1)?.path ?? "/";
  return sharp(await background(id, path), { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: content, raw: { width: CW, height: CH, channels: 4 }, left: CX, top: CY }])
    .removeAlpha()
    .raw()
    .toBuffer();
}

const phoneCache = new Map();
const PHONE_H = H - TOP + 10;
async function phoneFrame(t) {
  const i = frameAt(phone.frames, t);
  if (!phoneCache.has(i)) {
    phoneCache.set(
      i,
      (async () => {
        const src = await sharp(`${RAW}/${phone.dir}/${String(i).padStart(5, "0")}.jpg`).resize({ width: 780, kernel: "lanczos3" }).png().toBuffer();
        const framed = await phoned(src, { scale: 2, margin: 20 });
        return sharp(framed.buffer).resize({ height: PHONE_H }).png().toBuffer({ resolveWithObject: true });
      })(),
    );
  }
  const { data, info } = await phoneCache.get(i);
  return sharp(await background("phone"), { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: data, left: Math.round((W - info.width) / 2), top: TOP - 22 }])
    .removeAlpha()
    .raw()
    .toBuffer();
}

// ------------------------------------------------------------------ chapters
/** Output frames of one desktop chapter, as source times: played at its speed, the research wait fast-forwarded. */
function sceneTimes(scene) {
  const times = [];
  let t = scene.start;
  while (t < scene.end) {
    times.push(t);
    const fast = scene.fast.find(([a, b]) => t >= a && t < b);
    t += (fast ? fast[2] : SPEED[scene.id]) / FPS;
  }
  return times;
}

const stills = async (file) => sharp(file).resize(W, H).removeAlpha().raw().toBuffer();
const intro = await stills("docs/images/banner.png");
const outro = await sharp(
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="${FONT}">${BG}
<g transform="translate(${W / 2 - 132} 300)">
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
</g>
<text x="${W / 2}" y="530" text-anchor="middle" font-size="76" font-weight="800" fill="#ffffff" letter-spacing="-1.5">Network Growth Assistant</text>
<text x="${W / 2}" y="592" text-anchor="middle" font-size="30" fill="#c7d7f0">Verified people. Real jobs. Honest progress.</text>
<g transform="translate(${W / 2 - 330} 652)"><rect width="660" height="62" rx="31" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.22"/>
<text x="330" y="40" text-anchor="middle" font-size="23" font-weight="600" fill="#e6edf7">Free to run  ·  Never scrapes LinkedIn  ·  You send every message</text></g>
<text x="${W / 2}" y="790" text-anchor="middle" font-size="22" fill="#93c5fd">${HOST}</text>
<text x="${W / 2}" y="826" text-anchor="middle" font-size="20" fill="#8fb0e0">github.com/ShervinBabaei2007/Network-Growth-Assistance</text>
<text x="${W / 2}" y="1010" text-anchor="middle" font-size="16" fill="#8fb0e0" fill-opacity="0.8">Everything shown in this tour is fictional example data.</text>
</svg>`),
)
  .removeAlpha()
  .raw()
  .toBuffer();

const black = Buffer.alloc(W * H * 3);
/** Each part of the video: how many frames, and how to draw frame i. */
const parts = [
  { name: "title", count: Math.round(3.2 * FPS), draw: async () => intro },
  ...scenes.map((scene) => {
    const times = sceneTimes(scene);
    return { name: scene.id, count: times.length, draw: (i) => desktopFrame(scene.id, times[i]) };
  }),
  { name: "phone", count: Math.round((phone.seconds / SPEED.phone) * FPS), draw: (i) => phoneFrame((i / FPS) * SPEED.phone) },
  { name: "end", count: Math.round(3.4 * FPS), draw: async () => outro },
];

function blend(a, b, k) {
  const out = Buffer.allocUnsafe(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}

/** The video's frames in order: parts back to back, each crossfading into the next; a fade in and out at the ends. */
const plan = [];
let start = 0;
parts.forEach((p, n) => {
  p.start = n === 0 ? 0 : start - FADE;
  start = p.start + p.count;
});
const total = start;
for (let f = 0; f < total; f++) plan.push(parts.filter((p) => f >= p.start && f < p.start + p.count));

async function render(f) {
  const here = plan[f];
  let img = await here[0].draw(f - here[0].start);
  if (here.length > 1) img = blend(img, await here[1].draw(f - here[1].start), ease((f - here[1].start + 1) / (FADE + 1)));
  if (f < 10) img = blend(black, img, ease(f / 10));
  if (f >= total - 14) img = blend(img, black, ease((f - (total - 14)) / 14));
  return img;
}

// `--still 3.5,20` writes those moments (in seconds) as pictures instead, for checking the layout.
const still = process.argv.indexOf("--still");
if (still > 0) {
  mkdirSync(`${RAW}/stills`, { recursive: true });
  for (const s of process.argv[still + 1].split(",").map(Number)) {
    const f = Math.min(total - 1, Math.round(s * FPS));
    await sharp(await render(f), { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${RAW}/stills/${s}.png`);
  }
  console.log(`Wrote ${RAW}/stills (${(total / FPS).toFixed(1)}s in all)`);
  process.exit(0);
}

console.log(`Editing ${parts.map((p) => `${p.name} ${(p.count / FPS).toFixed(1)}s`).join(", ")}: ${(total / FPS).toFixed(1)}s in all`);
const enc = spawn(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
  "-c:v", "libx264", "-crf", "17", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", "docs/media/demo.mp4"], { stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise((resolve, reject) => enc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))));
const AHEAD = 6;
const queue = [];
for (let f = 0; f < total; f++) {
  while (queue.length < AHEAD && f + queue.length < total) queue.push(render(f + queue.length));
  const img = await queue.shift();
  if (!enc.stdin.write(img)) await new Promise((r) => enc.stdin.once("drain", r));
  if (f % 150 === 0) process.stdout.write(`  ${Math.round((f / total) * 100)}%\r`);
}
enc.stdin.end();
await done;
console.log(`docs/media/demo.mp4  ${W}x${H}  ${mb("docs/media/demo.mp4")} MB, ${(total / FPS).toFixed(1)} s`);

// --------------------------------------------------------------- preview
// A looping animated WebP the README can show inline, at 720p. Try gentler settings until it is small enough to load quickly.
const LIMIT_MB = 9;
const run = (args) => {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
};
rmSync("docs/images/demo.gif", { force: true });
for (const [fps, quality] of [[20, 82], [15, 78], [15, 70], [12, 66], [10, 60], [10, 50]]) {
  run(["-i", "docs/media/demo.mp4", "-vf", `fps=${fps},scale=1280:-2:flags=lanczos`, "-c:v", "libwebp_anim", "-quality", String(quality), "-compression_level", "6", "-loop", "0", "-an", "docs/images/demo.webp"]);
  console.log(`docs/images/demo.webp 1280px ${fps}fps quality ${quality}: ${mb("docs/images/demo.webp")} MB`);
  if (statSync("docs/images/demo.webp").size / 1024 / 1024 <= LIMIT_MB) break;
}
