import type { ReactNode } from "react";
import { MESSAGES, type Locale } from "./index";
import { I18nClientProvider } from "./client";
import type { Messages } from "./core";

/**
 * For server components: gives the client components below it the messages for `locale`, and only that language.
 * `groups` narrows what is sent to the top-level groups those components use (for example ["jobs", "common"]),
 * so a page does not carry the whole catalogue. Without it, every group is sent.
 */
export function I18nProvider({ locale, groups, children }: { locale: Locale; groups?: readonly (keyof Messages)[]; children: ReactNode }) {
  const all = MESSAGES[locale];
  const messages = groups ? (Object.fromEntries(groups.map((g) => [g, all[g]])) as unknown as Messages) : all;
  return (
    <I18nClientProvider locale={locale} messages={messages}>
      {children}
    </I18nClientProvider>
  );
}
