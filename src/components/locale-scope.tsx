import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

/**
 * Gives the client components below it the person's language, sending only the message groups they use.
 * Page content sits outside the layout's provider (so the shell can stay static); a page's content component
 * wraps what it renders in this when it contains client components that show text.
 */
export async function LocaleScope({ groups, children }: { groups: readonly (keyof Messages)[]; children: ReactNode }) {
  return (
    <I18nProvider locale={await getLocale()} groups={groups}>
      {children}
    </I18nProvider>
  );
}
