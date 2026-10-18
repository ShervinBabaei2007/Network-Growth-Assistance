import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, translator, type Locale, type Translator } from "./index";

/**
 * The language for this request: the person's saved choice (a cookie, kept in step with their settings), otherwise
 * the browser's language. Read once per request. Using this makes the caller dynamic, so only the signed-in app and
 * the sign-in pages use it; the public marketing pages stay English and static.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  try {
    return negotiateLocale((await headers()).get("accept-language"));
  } catch {
    return DEFAULT_LOCALE;
  }
});

export async function getT(): Promise<Translator> {
  return translator(await getLocale());
}
