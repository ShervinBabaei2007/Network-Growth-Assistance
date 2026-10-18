import type { ReactNode } from "react";
import { MESSAGES, type Locale } from "./index";
import { I18nClientProvider } from "./client";

/** For server components: gives the client components below it the messages for `locale`, and only that language. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <I18nClientProvider locale={locale} messages={MESSAGES[locale]}>
      {children}
    </I18nClientProvider>
  );
}
