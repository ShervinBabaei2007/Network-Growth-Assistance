import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads the colour tokens from globals.css and checks WCAG contrast in both themes, so a
// palette change can't quietly make text or form-field borders hard to see.

const css = readFileSync("src/app/globals.css", "utf8").replace(/\r/g, "");

function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

function tokens(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = tokens(block(":root"));
const dark = { ...light, ...tokens(block(".dark")) };

type Color = { rgb: [number, number, number]; a: number }; // linear sRGB

function parse(value: string): Color {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return { rgb: [lin((n >> 16) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)], a: 1 };
  }
  const m = value.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+)%)?\)$/);
  if (!m) throw new Error(`Unsupported colour: ${value}`);
  const [L, C] = [Number(m[1]), Number(m[2])];
  const h = (Number(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return {
    rgb: [
      clamp(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s),
      clamp(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
      clamp(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s),
    ],
    a: m[4] ? Number(m[4]) / 100 : 1,
  };
}

const luminance = (c: Color) => 0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2];

function contrast(theme: Record<string, string>, fg: string, bg: string): number {
  const back = parse(theme[bg]);
  const front = parse(theme[fg]);
  const shown: Color = {
    rgb: front.rgb.map((c, i) => c * front.a + back.rgb[i] * (1 - front.a)) as [number, number, number],
    a: 1,
  };
  const [hi, lo] = [luminance(shown), luminance(back)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text and icons: 4.5:1.
const TEXT: [string, string][] = [
  ["foreground", "background"], ["card-foreground", "card"], ["popover-foreground", "popover"],
  ["primary-foreground", "primary"], ["secondary-foreground", "secondary"], ["accent-foreground", "accent"],
  ["muted-foreground", "background"], ["muted-foreground", "card"], ["muted-foreground", "muted"],
  ["muted-foreground", "sidebar"], ["muted-foreground", "secondary"],
  ["destructive", "background"], ["destructive", "card"], ["destructive", "danger-soft"],
  ["success", "success-soft"], ["success", "background"], ["success", "card"],
  ["info", "info-soft"], ["info", "background"], ["info", "card"],
  ["warning", "warning-soft"], ["warning", "background"], ["warning", "card"],
  ["sidebar-foreground", "sidebar"], ["sidebar-accent-foreground", "sidebar-accent"],
  ["sidebar-primary-foreground", "sidebar-primary"], ["primary", "background"], ["primary", "card"],
  ["foreground", "info-soft"], ["foreground", "warning-soft"], ["foreground", "danger-soft"], ["foreground", "success-soft"],
];

// Form-field borders and the focus ring: 3:1 (WCAG 1.4.11).
const COMPONENTS: [string, string][] = [
  ["input", "background"], ["input", "card"], ["ring", "background"], ["ring", "card"],
];

describe.each([["light", light], ["dark", dark]] as const)("%s theme contrast", (_name, theme) => {
  it.each(TEXT)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(COMPONENTS)("%s against %s is at least 3:1", (fg, bg) => {
    expect(contrast(theme, fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
