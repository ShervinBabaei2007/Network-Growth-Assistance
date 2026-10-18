"use client";

import { useTransition } from "react";
import { setLocale } from "@/app/locale-actions";
import { toast } from "@/components/toast/notify";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";

/** A plain native select: it works with a keyboard, a screen reader and a phone's own picker. */
export function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <label className={className}>
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={locale}
        disabled={pending}
        aria-label={t("language.label")}
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        onChange={(e) => {
          const next = e.target.value as Locale;
          start(async () => {
            const result = await setLocale(next);
            if (!result.ok) toast.error(t("language.failed"));
          });
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
