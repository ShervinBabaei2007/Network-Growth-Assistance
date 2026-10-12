/**
 * Appearance: theme (system, light, dark), density and text size.
 *
 * The source of truth is the user's settings row. A copy lives in the "appearance" cookie
 * so an inline script can apply it before the first paint, without the root layout reading
 * cookies (which would stop pages from being prerendered). The app layout refreshes the
 * cookie from settings, so a new device catches up on its first page.
 */

export const THEMES = ["system", "light", "dark"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;
export const TEXT_SIZES = ["normal", "large"] as const;

export type Appearance = { theme: (typeof THEMES)[number]; density: (typeof DENSITIES)[number]; text: (typeof TEXT_SIZES)[number] };

export const DEFAULT_APPEARANCE: Appearance = { theme: "system", density: "comfortable", text: "normal" };
export const APPEARANCE_COOKIE = "appearance";
export const APPEARANCE_MAX_AGE = 60 * 60 * 24 * 365;

const pick = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] => (typeof v === "string" && (list as readonly string[]).includes(v) ? v : fallback);

export function normalizeAppearance(v: { theme?: unknown; density?: unknown; text?: unknown }): Appearance {
  return {
    theme: pick(THEMES, v.theme, DEFAULT_APPEARANCE.theme),
    density: pick(DENSITIES, v.density, DEFAULT_APPEARANCE.density),
    text: pick(TEXT_SIZES, v.text, DEFAULT_APPEARANCE.text),
  };
}

/** "dark.compact.large" */
export const serializeAppearance = (a: Appearance) => `${a.theme}.${a.density}.${a.text}`;

export function parseAppearance(cookie: string | null | undefined): Appearance {
  const [theme, density, text] = (cookie ?? "").split(".");
  return normalizeAppearance({ theme, density, text });
}

/**
 * Runs in <head> before the page paints: reads the cookie and sets the attributes the CSS
 * keys on. Kept tiny and dependency-free; mirrors parseAppearance and applyAppearance.
 */
export const APPEARANCE_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${APPEARANCE_COOKIE}=([^;]*)/);var p=(m?decodeURIComponent(m[1]):"").split(".");var t=["light","dark"].indexOf(p[0])>-1?p[0]:"system";var d=p[1]==="compact"?"compact":"comfortable";var x=p[2]==="large"?"large":"normal";var r=document.documentElement;var dark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",dark);r.style.colorScheme=dark?"dark":"light";r.dataset.theme=t;r.dataset.density=d;r.dataset.text=x}catch(e){}})()`;

/** Applies an appearance to the page (client only). Returns whether it ended up dark. */
export function applyAppearance(a: Appearance, prefersDark: boolean): boolean {
  const root = document.documentElement;
  const dark = a.theme === "dark" || (a.theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.theme = a.theme;
  root.dataset.density = a.density;
  root.dataset.text = a.text;
  return dark;
}
