import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getSettings } from "@/lib/data/settings";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, translator, type Locale, type Translator } from "./index";

/**
 * The language for this request: the person's choice on this device (a cookie), else the one saved in their account,
 * else the browser's language. Read once per request. Using this makes the caller dynamic, so only the signed-in app and
 * the sign-in pages use it; the public marketing pages stay English and static.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  // No cookie on this device: a signed-in person's saved choice follows them here (the settings read is shared with the page).
  try {
    const { row } = await getSettings();
    if (isLocale(row?.locale)) return row.locale;
  } catch {
    // Not signed in or unreadable: fall through to the browser's language.
  }
  try {
    return negotiateLocale((await headers()).get("accept-language"));
  } catch {
    return DEFAULT_LOCALE;
  }
});

export async function getT(): Promise<Translator> {
  return translator(await getLocale());
}
