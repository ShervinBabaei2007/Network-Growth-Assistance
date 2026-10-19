#!/usr/bin/env node
/**
 * Makes the 30-second tour at the top of README.md:
 *
 *   npm run db:start
 *   npm run docs:video              record the app (Playwright), edit it (ffmpeg), write the files
 *   npm run docs:video -- --edit    re-edit the footage already recorded, without recording again
 *
 * Writes docs/media/demo.mp4 (the full-quality video) and docs/images/demo.gif (a silent, looping preview that plays
 * inside the README). The footage is the app's own example data, recorded by e2e/readme-video.spec.ts. ffmpeg comes from the
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
const W = 1280;
const H = 720;
const run = (args) => {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error(`ffmpeg failed: ${args.slice(0, 6).join(" ")} …`);
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
for (const f of ["desktop.webm", "phone.webm", "timeline.json"]) if (!existsSync(`${RAW}/${f}`)) throw new Error(`Missing ${RAW}/${f}: record first (npm run docs:video).`);
const { fast, marks, phoneSeconds, phoneStart } = JSON.parse(readFileSync(`${RAW}/timeline.json`, "utf8"));
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync("docs/media", { recursive: true });

// ------------------------------------------------------------------- cards
const FONT = "'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif";
const bg = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="0.55" stop-color="#112347"/><stop offset="1" stop-color="#17407a"/></linearGradient>
<radialGradient id="glow" cx="0.2" cy="0.2" r="0.7"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.35"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>`;
const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${bg}${body}</svg>`);

// The title card: the banner on the card background.
const banner = await sharp("docs/images/banner.png").resize({ width: 1180 }).toBuffer();
const bannerH = (await sharp(banner).metadata()).height;
await sharp(svg(""))
  .composite([{ input: banner, left: 50, top: Math.round((H - bannerH) / 2) - 20 }])
  .png()
  .toFile(`${WORK}/intro.png`);

await sharp(
  svg(`
<text x="${W / 2}" y="270" text-anchor="middle" font-size="62" font-weight="800" fill="#fff" letter-spacing="-1">Network Growth Assistant</text>
<text x="${W / 2}" y="332" text-anchor="middle" font-size="28" fill="#c7d7f0">Verified people. Real jobs. Honest progress.</text>
<g transform="translate(${W / 2 - 300} 380)"><rect width="600" height="64" rx="32" fill="#fff" fill-opacity="0.08" stroke="#fff" stroke-opacity="0.2"/>
<text x="300" y="41" text-anchor="middle" font-size="22" font-weight="600" fill="#e6edf7">Free to run  ·  Never touches LinkedIn</text></g>
<text x="${W / 2}" y="520" text-anchor="middle" font-size="22" fill="#8fb0e0">github.com/ShervinBabaei2007/Network-Growth-Assistance</text>
<text x="${W / 2}" y="660" text-anchor="middle" font-size="16" fill="#8fb0e0" fill-opacity="0.8">All data shown in this tour is fictional example data.</text>`),
)
  .png()
  .toFile(`${WORK}/outro.png`);

await sharp(
  svg(`
<text x="150" y="330" font-size="52" font-weight="800" fill="#fff" letter-spacing="-1">On a phone too</text>
<text x="150" y="384" font-size="26" fill="#c7d7f0">Lists become cards.</text>
<text x="150" y="424" font-size="26" fill="#c7d7f0">Filters tuck behind a button.</text>`),
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
run(["-i", `${RAW}/desktop.webm`, "-filter_complex", filter, "-map", "[out]", "-c:v", "libx264", "-crf", "20", "-preset", "medium", `${WORK}/desktop.mp4`]);

// ------------------------------------------------------------------- phone
const phoneLen = Math.min(4.2, (phoneSeconds - phoneStart) / 1.15);
run([
  "-loop", "1", "-i", `${WORK}/phone-bg.png`, "-i", `${RAW}/phone.webm`,
  "-filter_complex",
  `[1:v]trim=start=${phoneStart}:end=${phoneSeconds},setpts=(PTS-STARTPTS)/1.15,scale=-2:620:flags=lanczos,format=yuv420p[p];[0:v][p]overlay=x=W-w-190:y=(H-h)/2:shortest=1,fps=30,format=yuv420p[out]`,
  "-map", "[out]", "-t", String(phoneLen), "-c:v", "libx264", "-crf", "20", `${WORK}/phone.mp4`,
]);

// -------------------------------------------------------- cards as clips
const still = (name, seconds) =>
  run(["-loop", "1", "-t", String(seconds), "-i", `${WORK}/${name}.png`, "-vf", `fps=30,fade=t=in:st=0:d=0.35,fade=t=out:st=${seconds - 0.35}:d=0.35,format=yuv420p`, "-c:v", "libx264", "-crf", "18", `${WORK}/${name}.mp4`]);
still("intro", 2.4);
still("outro", 2.6);

// ---------------------------------------------------------------- join
writeFileSync(`${WORK}/list.txt`, ["intro", "desktop", "phone", "outro"].map((n) => `file '${n}.mp4'`).join("\n"));
run(["-f", "concat", "-safe", "0", "-i", `${WORK}/list.txt`, "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-movflags", "+faststart", "-an", "docs/media/demo.mp4"]);
const length = secondsOf("docs/media/demo.mp4");
console.log(`docs/media/demo.mp4  ${mb("docs/media/demo.mp4")} MB, ${length.toFixed(1)} s`);

// --------------------------------------------------------------- preview
// A looping GIF the README can show inline. Try a few sizes until it is small enough to load quickly.
const LIMIT_MB = 9;
for (const [width, fps, colors] of [[800, 10, 128], [720, 10, 96], [640, 8, 96], [560, 8, 64]]) {
  run(["-i", "docs/media/demo.mp4", "-vf", `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, "-loop", "0", "docs/images/demo.gif"]);
  console.log(`docs/images/demo.gif ${width}px ${fps}fps ${colors} colours: ${mb("docs/images/demo.gif")} MB`);
  if (statSync("docs/images/demo.gif").size / 1024 / 1024 <= LIMIT_MB) break;
}
rmSync(WORK, { recursive: true, force: true });
