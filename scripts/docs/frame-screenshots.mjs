#!/usr/bin/env node
/**
 * Frames the raw README pictures from test-results/readme-shots (taken by e2e/readme-screenshots*.spec.ts) and writes
 * them to docs/images: desktop pages in a browser window showing the page's address, phone pages in a phone.
 *
 *   npm run docs:screenshots            take the pictures, then frame them
 *   node scripts/docs/frame-screenshots.mjs   frame the pictures already taken
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import sharp from "sharp";
import { phoned, windowed } from "./frame.mjs";

const RAW = "test-results/readme-shots";
const OUT = "docs/images";
if (!existsSync(RAW)) throw new Error(`No pictures in ${RAW}: run npm run docs:screenshots first.`);

const names = readdirSync(RAW).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
for (const name of names) {
  const meta = JSON.parse(readFileSync(`${RAW}/${name}.json`, "utf8"));
  const raw = readFileSync(`${RAW}/${name}.png`);
  const framed = meta.kind === "phone" ? await phoned(raw) : await windowed(raw, { path: meta.path, dark: meta.dark });
  const width = meta.kind === "phone" ? 840 : 1920;
  await sharp(framed.buffer).resize({ width, kernel: "lanczos3" }).png({ compressionLevel: 9, effort: 10 }).toFile(`${OUT}/${name}.png`);
  console.log(`${OUT}/${name}.png  ${(statSync(`${OUT}/${name}.png`).size / 1024).toFixed(0)} KB  ${meta.kind} ${meta.path}`);
}
