import { en, type Messages } from "./messages/en";
import { frCA } from "./messages/fr-CA";

/**
 * A small, typed translation layer. The English file defines every key; the French file must have exactly the
 * same keys (TypeScript refuses to compile otherwise, and a test checks that every {placeholder} is kept).
 * No library and no JSON: the browser only downloads the messages for the language in use.
 */

export const LOCALES = ["en", "fr-CA"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", "fr-CA": "Français (Canada)" };

export const MESSAGES: Record<Locale, Messages> = { en, "fr-CA": frCA };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** The best supported language for an Accept-Language header ("fr-CA,fr;q=0.9,en;q=0.8"). Any French becomes Canadian French. */
export function negotiateLocale(header: string | null | undefined): Locale {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]!.trim().toLowerCase();
    if (tag === "fr" || tag.startsWith("fr-")) return "fr-CA";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return DEFAULT_LOCALE;
}

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string ? never : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T & string];
export type MessageKey = Paths<Messages>;

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export type Params = Record<string, string | number>;

/** Fills {placeholders}. A key missing from the chosen language falls back to English, then to the key itself. */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const text = lookup(MESSAGES[locale], key) ?? lookup(en, key) ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
}

export type Translator = (key: MessageKey, params?: Params) => string;
export const translator = (locale: Locale): Translator => (key, params) => translate(locale, key, params);

/** Intl formatting in the person's language, with Canadian conventions (dollars, dates) in both. */
export function formatters(locale: Locale) {
  const tag = locale === "fr-CA" ? "fr-CA" : "en-CA";
  return {
    number: (n: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag, options).format(n),
    currency: (n: number, currency = "CAD") => new Intl.NumberFormat(tag, { style: "currency", currency }).format(n),
    date: (d: Date | string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }, timeZone?: string) => new Intl.DateTimeFormat(tag, { timeZone, ...options }).format(typeof d === "string" ? new Date(d) : d),
  };
}
