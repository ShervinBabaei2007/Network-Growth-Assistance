/**
 * Window and phone frames for the README pictures, the banner and the tour. Everything is drawn here with sharp,
 * so nothing is fetched. Used by frame-screenshots.mjs, banner.mjs and make-video.mjs.
 */
import sharp from "sharp";

export const FONT = "'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif";
export const HOST = "linkedin-network-growth-assistance.vercel.app";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Light and dark window colours. */
const THEME = {
  light: { bar: "#f6f8fb", line: "#e2e8f0", pill: "#e9eef5", text: "#475569", lock: "#64748b" },
  dark: { bar: "#141c2b", line: "#273349", pill: "#0d1422", text: "#94a3b8", lock: "#7c8aa3" },
};

/**
 * A browser title bar (traffic lights and an address pill) `w` pixels wide, at `s` pixels per CSS pixel.
 * Returns SVG markup positioned at 0,0; the bar is 40 CSS pixels tall with rounded top corners.
 */
export function titleBar(w, s, path, dark = false, radius = 12) {
  const t = THEME[dark ? "dark" : "light"];
  const h = 40 * s;
  const r = radius * s;
  const lights = ["#ff5f57", "#febc2e", "#28c840"].map((c, i) => `<circle cx="${(20 + i * 20) * s}" cy="${h / 2}" r="${6 * s}" fill="${c}"/>`).join("");
  // Long ids are shortened the way a browser's address bar would make them unimportant: /discover/2b556f19…
  const short = path.replace(/\?ids=.*$/, "").replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "$1…");
  const label = `${HOST}${short === "/" ? "" : short}`;
  const pillW = Math.min(w - 220 * s, Math.max(360 * s, (label.length * 7.3 + 64) * s));
  const px = (w - pillW) / 2;
  return `<path d="M0 ${r}a${r} ${r} 0 0 1 ${r} -${r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${h}H0z" fill="${t.bar}"/>
<rect x="0" y="${h - s}" width="${w}" height="${s}" fill="${t.line}"/>
${lights}
<rect x="${px}" y="${8 * s}" width="${pillW}" height="${24 * s}" rx="${12 * s}" fill="${t.pill}"/>
<g transform="translate(${px + 16 * s} ${13.5 * s}) scale(${s})" fill="none" stroke="${t.lock}" stroke-width="1.4"><rect x="0.7" y="5.5" width="9" height="7" rx="1.6" fill="${t.lock}" stroke="none"/><path d="M2.4 5.6V3.9a2.8 2.8 0 0 1 5.6 0v1.7"/></g>
<text x="${px + 32 * s}" y="${24.5 * s}" font-size="${12.5 * s}" fill="${t.text}" font-family="${FONT}">${esc(label)}</text>`;
}

/** Rounds the bottom corners of a picture (the top sits under the title bar). */
async function roundBottom(buf, w, h, r) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="M0 0H${w}V${h - r}a${r} ${r} 0 0 1 -${r} ${r}H${r}a${r} ${r} 0 0 1 -${r} -${r}z" fill="#fff"/></svg>`);
  return sharp(buf).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

/**
 * A desktop screenshot in a browser window with a soft shadow, transparent around it.
 * `scale` is the screenshot's pixels per CSS pixel. Returns { buffer, width, height, margin } where margin is the shadow room.
 */
export async function windowed(buf, { path = "/", dark = false, scale = 2, margin = 30 } = {}) {
  const { width: w, height: h } = await sharp(buf).metadata();
  const s = scale;
  const bar = 40 * s;
  const r = 12 * s;
  const m = margin * s;
  const W = w + 2 * m;
  const H = h + bar + 2 * m;
  const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><filter id="f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${18 * s}"/></filter><filter id="g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${3 * s}"/></filter></defs>
<rect x="${m}" y="${m + 14 * s}" width="${w}" height="${h + bar}" rx="${r}" fill="#0f172a" fill-opacity="${dark ? 0.55 : 0.22}" filter="url(#f)"/>
<rect x="${m}" y="${m + 2 * s}" width="${w}" height="${h + bar}" rx="${r}" fill="#0f172a" fill-opacity="0.12" filter="url(#g)"/>
<rect x="${m - 0.5 * s}" y="${m - 0.5 * s}" width="${w + s}" height="${h + bar + s}" rx="${r + 0.5 * s}" fill="${dark ? "#334155" : "#cbd5e1"}"/>
<g transform="translate(${m} ${m})">${titleBar(w, s, path, dark)}</g>
</svg>`);
  const body = await roundBottom(buf, w, h, r);
  const buffer = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow }, { input: body, left: m, top: m + bar }])
    .png()
    .toBuffer();
  return { buffer, width: W, height: H, margin: m };
}

/**
 * A phone screenshot in a phone body: a dark bezel, a status bar with the time, and rounded corners.
 * `scale` is the screenshot's pixels per CSS pixel. Transparent around it, with a soft shadow.
 */
export async function phoned(buf, { scale = 3, margin = 28 } = {}) {
  const { width: w, height: h } = await sharp(buf).metadata();
  const s = scale;
  const status = 44 * s;
  const bezel = 11 * s;
  const sr = 46 * s; // screen corner
  const br = sr + bezel; // body corner
  const m = margin * s;
  const sw = w;
  const sh = h + status;
  const BW = sw + 2 * bezel;
  const BH = sh + 2 * bezel;
  const W = BW + 2 * m;
  const H = BH + 2 * m;
  const icons = `<g fill="#0f172a" transform="translate(${sw - 92 * s} ${17 * s}) scale(${s})">
<rect x="0" y="7" width="3" height="4" rx="0.8"/><rect x="5" y="5" width="3" height="6" rx="0.8"/><rect x="10" y="3" width="3" height="8" rx="0.8"/><rect x="15" y="1" width="3" height="10" rx="0.8"/>
<path d="M30 3.2a10 10 0 0 1 13 0l-1.6 1.7a7.6 7.6 0 0 0-9.8 0zM32.9 6.3a5.6 5.6 0 0 1 7.2 0l-3.6 4z"/>
<rect x="52" y="0.5" width="23" height="11" rx="3.2" fill="none" stroke="#0f172a" stroke-opacity="0.45" stroke-width="1"/><rect x="54" y="2.5" width="17" height="7" rx="1.8"/><rect x="76.2" y="4" width="1.6" height="4" rx="0.8" fill-opacity="0.45"/></g>`;
  const screenTop = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${status}">
<rect width="${sw}" height="${status}" fill="#ffffff"/>
<text x="${46 * s}" y="${29 * s}" text-anchor="middle" font-size="${15.5 * s}" font-weight="600" fill="#0f172a" font-family="${FONT}">9:41</text>
<rect x="${sw / 2 - 58 * s}" y="${10 * s}" width="${116 * s}" height="${32 * s}" rx="${16 * s}" fill="#05070c"/>
${icons}</svg>`);
  const screen = await sharp({ create: { width: sw, height: sh, channels: 4, background: "#ffffff" } })
    .composite([{ input: screenTop, top: 0, left: 0 }, { input: buf, top: status, left: 0 }])
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}"><rect width="${sw}" height="${sh}" rx="${sr}" fill="#fff"/></svg>`);
  const rounded = await sharp(screen).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const body = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><filter id="f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${14 * s}"/></filter>
<linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b4458"/><stop offset="0.5" stop-color="#1b2130"/><stop offset="1" stop-color="#394257"/></linearGradient></defs>
<rect x="${m}" y="${m + 16 * s}" width="${BW}" height="${BH}" rx="${br}" fill="#0f172a" fill-opacity="0.3" filter="url(#f)"/>
<rect x="${m - 1.5 * s}" y="${m - 1.5 * s}" width="${BW + 3 * s}" height="${BH + 3 * s}" rx="${br + 1.5 * s}" fill="url(#edge)"/>
<rect x="${m}" y="${m}" width="${BW}" height="${BH}" rx="${br}" fill="#07090f"/>
</svg>`);
  const buffer = await sharp(body)
    .composite([{ input: rounded, left: m + bezel, top: m + bezel }])
    .png()
    .toBuffer();
  return { buffer, width: W, height: H, margin: m };
}
