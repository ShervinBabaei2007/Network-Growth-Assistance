"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, translator, type Locale, type Translator } from "./index";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Makes the language available to client components, and keeps the page's `lang` attribute in step with it. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

export function useT(): Translator {
  const locale = useLocale();
  return useMemo(() => translator(locale), [locale]);
}
