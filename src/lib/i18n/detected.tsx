"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, type Locale, type Messages } from "./core";
import { LocaleContext } from "./client";
import { en } from "./messages/en";

async function messagesFor(locale: Locale): Promise<Messages> {
  // French is fetched only for the people who need it.
  return locale === "fr-CA" ? (await import("./messages/fr-CA")).frCA : en;
}

function detect(): Locale {
  const saved = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`))?.[1];
  if (isLocale(saved)) return saved;
  return negotiateLocale((navigator.languages?.length ? navigator.languages : [navigator.language]).join(","));
}

/**
 * For the sign-in and reset pages: they paint at once in English, then switch in place to the person's language
 * (their saved choice, else the browser's). The same component stays mounted the whole time, so nothing a person
 * has already typed or chosen is lost, which a server-side swap of the page would not guarantee.
 */
export function DetectedLocaleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ locale: Locale; messages: Messages }>({ locale: DEFAULT_LOCALE, messages: en });

  const switchLocale = useCallback(async (locale: Locale) => {
    const messages = await messagesFor(locale);
    setState({ locale, messages });
  }, []);

  useEffect(() => {
    const wanted = detect();
    if (wanted === DEFAULT_LOCALE) return;
    let cancelled = false;
    void messagesFor(wanted).then((messages) => {
      if (!cancelled) setState({ locale: wanted, messages });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = state.locale;
  }, [state.locale]);

  const value = useMemo(() => ({ ...state, switchLocale }), [state, switchLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
