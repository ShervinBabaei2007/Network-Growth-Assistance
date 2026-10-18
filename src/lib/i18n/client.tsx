"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, translatorFor, type Locale, type Messages, type Translator } from "./core";

type Value = {
  locale: Locale;
  messages: Messages | null;
  /** Present when the language is worked out in the browser (see ./detected): switching updates the page in place. */
  switchLocale?: (locale: Locale) => void | Promise<void>;
};

export const LocaleContext = createContext<Value>({ locale: DEFAULT_LOCALE, messages: null });

/**
 * Makes the language available to client components, and keeps the page's `lang` attribute in step with it.
 * The messages for the one language in use arrive as props from the server (see ./provider), so the other
 * languages are never downloaded. Use ./provider in server components rather than this directly.
 */
export function I18nClientProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext).locale;

/** For a language picker: switches the page in place when the language is detected in the browser; otherwise the server re-renders. */
export const useSwitchLocale = () => useContext(LocaleContext).switchLocale;

/** Translates with the provider's messages. Without a provider it returns the key, so a missing one is easy to spot. */
export function useT(): Translator {
  const { messages } = useContext(LocaleContext);
  return useMemo(() => (messages ? translatorFor(messages) : (key) => key), [messages]);
}
