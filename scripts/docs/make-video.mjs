#!/usr/bin/env node
/**
 * Makes the 30-second tour at the top of README.md:
 *
 *   npm run db:start
 *   npm run docs:video              record the app (Playwright), edit it (ffmpeg), write the files
 *   npm run docs:video -- --edit    re-edit the footage already recorded, without recording again
 *
 * Writes docs/media/demo.mp4 (1920x1080, the full-quality video) and docs/images/demo.webp (a silent, looping 1280x720
 * preview that plays inside the README; GitHub cannot play a video from the repository, but it shows animated WebP).
 * The footage is the app's own example data, captured frame by frame by e2e/readme-video.spec.ts. ffmpeg comes from the
 * `ffmpeg-static` package, so nothing needs installing on the machine.
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import sharp from "sharp";

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
const WORK = `${RAW}/edit`;
const W = 1920;
const H = 1080;
const S = W / 1280; // the cards are laid out on a 1280-wide grid
const run = (args) => {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error(`ffmpeg failed: ${args.slice(0, 8).join(" ")} …`);
  }
};
const mb = (p) => (statSync(p).size / 1024 / 1024).toFixed(1);
const secondsOf = (p) => {
  const out = spawnSync(ffmpeg, ["-hide_banner", "-i", p], { encoding: "utf8" }).stderr;
  const m = out.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
};

// ------------------------------------------------------------------ record
if (!process.argv.includes("--edit")) {
  console.log("Recording the tour (Playwright, example data)…");
  execSync("npx playwright test -c playwright.video.config.ts", { stdio: "inherit" });
}
if (!existsSync(`${RAW}/timeline.json`)) throw new Error(`Missing ${RAW}/timeline.json: record first (npm run docs:video).`);
const { fast, marks, desktop, phone } = JSON.parse(readFileSync(`${RAW}/timeline.json`, "utf8"));
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync("docs/media", { recursive: true });

/** Numbered JPEG frames with their capture times → a constant 30 fps video at the frames' own size. */
function framesToVideo({ dir, frames }, out) {
  const lines = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? f.t + 0.05;
    lines.push(`file '${dir}/${String(i).padStart(5, "0")}.jpg'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  lines.push(`file '${dir}/${String(frames.length - 1).padStart(5, "0")}.jpg'`); // the last frame is repeated so its duration counts
  writeFileSync(`${RAW}/${dir}.txt`, lines.join("\n"));
  run(["-f", "concat", "-safe", "0", "-i", `${RAW}/${dir}.txt`, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "12", "-preset", "veryfast", out]);
}
framesToVideo(desktop, `${WORK}/desktop-raw.mp4`);
framesToVideo(phone, `${WORK}/phone-raw.mp4`);

// ------------------------------------------------------------------- cards
const FONT = "'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif";
const bg = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="0.55" stop-color="#112347"/><stop offset="1" stop-color="#17407a"/></linearGradient>
<radialGradient id="glow" cx="0.2" cy="0.2" r="0.7"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.35"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>`;
const withBg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${bg}<g transform="scale(${S})">${body}</g></svg>`);

// The title card: the banner on the card background.
const banner = await sharp("docs/images/banner.svg", { density: 192 }).resize({ width: 1780 }).png().toBuffer();
const bannerH = (await sharp(banner).metadata()).height;
await sharp(withBg(""))
  .composite([{ input: banner, left: 70, top: Math.round((H - bannerH) / 2) }])
  .png()
  .toFile(`${WORK}/intro.png`);

await sharp(
  withBg(`
<text x="640" y="262" text-anchor="middle" font-size="62" font-weight="800" fill="#fff" letter-spacing="-1">Network Growth Assistant</text>
<text x="640" y="326" text-anchor="middle" font-size="28" fill="#c7d7f0">Verified people. Real jobs. Honest progress.</text>
<g transform="translate(340 372)"><rect width="600" height="64" rx="32" fill="#fff" fill-opacity="0.08" stroke="#fff" stroke-opacity="0.2"/>
<text x="300" y="41" text-anchor="middle" font-size="22" font-weight="600" fill="#e6edf7">Free to run  ·  Never touches LinkedIn</text></g>
<text x="640" y="508" text-anchor="middle" font-size="22" fill="#8fb0e0">github.com/ShervinBabaei2007/Network-Growth-Assistance</text>
<text x="640" y="660" text-anchor="middle" font-size="16" fill="#8fb0e0" fill-opacity="0.8">All data shown in this tour is fictional example data.</text>`),
)
  .png()
  .toFile(`${WORK}/outro.png`);

await sharp(
  withBg(`
<text x="150" y="320" font-size="52" font-weight="800" fill="#fff" letter-spacing="-1">On a phone too</text>
<text x="150" y="374" font-size="26" fill="#c7d7f0">Lists become cards.</text>
<text x="150" y="414" font-size="26" fill="#c7d7f0">Filters tuck behind a button.</text>`),
)
  .png()
  .toFile(`${WORK}/phone-bg.png`);

// ------------------------------------------------------------ desktop edit
// Cut list from the markers: skip page loads between scenes, run typing a little faster, and fast-forward the wait for results.
const [waitA, waitB] = fast[0];
const segments = [
  [0.9, marks.overviewEnd, 1.0],
  [marks.discoverStart, waitA, 1.4],
  [waitA, waitB, 8.0],
  [waitB, marks.discoverEnd, 1.0],
  [marks.jobsStart, marks.jobsEnd, 1.15],
  [marks.jobsEnd + 0.5, marks.end, 1.2],
].filter(([a, b]) => b - a > 0.2);
const filter =
  segments.map(([a, b, speed], i) => `[0:v]trim=start=${a}:end=${b},setpts=(PTS-STARTPTS)/${speed}[v${i}]`).join(";") +
  `;${segments.map((_, i) => `[v${i}]`).join("")}concat=n=${segments.length}:v=1:a=0,fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p[out]`;
run(["-i", `${WORK}/desktop-raw.mp4`, "-filter_complex", filter, "-map", "[out]", "-c:v", "libx264", "-crf", "14", "-preset", "medium", `${WORK}/desktop.mp4`]);

// ------------------------------------------------------------------- phone
const phoneSpeed = 1.15;
const phoneLen = Math.min(4.2, phone.seconds / phoneSpeed);
run([
  "-loop", "1", "-i", `${WORK}/phone-bg.png`, "-i", `${WORK}/phone-raw.mp4`,
  "-filter_complex",
  `[1:v]setpts=(PTS-STARTPTS)/${phoneSpeed},scale=-2:900:flags=lanczos,format=yuv420p[p];[0:v][p]overlay=x=W-w-300:y=(H-h)/2:shortest=1,fps=30,format=yuv420p[out]`,
  "-map", "[out]", "-t", String(phoneLen), "-c:v", "libx264", "-crf", "14", `${WORK}/phone.mp4`,
]);

// -------------------------------------------------------- cards as clips
const still = (name, seconds) =>
  run(["-loop", "1", "-t", String(seconds), "-i", `${WORK}/${name}.png`, "-vf", `fps=30,fade=t=in:st=0:d=0.35,fade=t=out:st=${seconds - 0.35}:d=0.35,format=yuv420p`, "-c:v", "libx264", "-crf", "14", `${WORK}/${name}.mp4`]);
still("intro", 2.4);
still("outro", 2.6);

// ---------------------------------------------------------------- join
writeFileSync(`${WORK}/list.txt`, ["intro", "desktop", "phone", "outro"].map((n) => `file '${n}.mp4'`).join("\n"));
run(["-f", "concat", "-safe", "0", "-i", `${WORK}/list.txt`, "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", "docs/media/demo.mp4"]);
const length = secondsOf("docs/media/demo.mp4");
console.log(`docs/media/demo.mp4  ${W}x${H}  ${mb("docs/media/demo.mp4")} MB, ${length.toFixed(1)} s`);

// --------------------------------------------------------------- preview
// A looping animated WebP the README can show inline, at least 720p. Try gentler settings until it is small enough to load quickly.
const LIMIT_MB = 9;
rmSync("docs/images/demo.gif", { force: true });
for (const [width, fps, quality] of [[1280, 20, 85], [1280, 15, 80], [1280, 15, 72], [1280, 12, 66], [1280, 10, 55]]) {
  run(["-i", "docs/media/demo.mp4", "-vf", `fps=${fps},scale=${width}:-2:flags=lanczos`, "-c:v", "libwebp_anim", "-quality", String(quality), "-compression_level", "6", "-loop", "0", "-an", "docs/images/demo.webp"]);
  console.log(`docs/images/demo.webp ${width}px ${fps}fps quality ${quality}: ${mb("docs/images/demo.webp")} MB`);
  if (statSync("docs/images/demo.webp").size / 1024 / 1024 <= LIMIT_MB) break;
}
rmSync(WORK, { recursive: true, force: true });
