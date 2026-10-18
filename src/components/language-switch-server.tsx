import { LanguageSwitch } from "@/components/language-switch";
import { I18nProvider } from "@/lib/i18n/provider";
import { getLocale } from "@/lib/i18n/server";

/** The language picker for a page that has no provider above it (such as Settings). */
export async function LanguageSwitchServer() {
  return (
    <I18nProvider locale={await getLocale()}>
      <LanguageSwitch />
    </I18nProvider>
  );
}
