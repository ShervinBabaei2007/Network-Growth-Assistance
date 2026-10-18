import { FormError } from "@/components/form-error";
import { LanguageSwitch } from "@/components/language-switch";
import { canonicalFor } from "@/lib/site";
import { Suspense } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { translator, type Locale } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { LoginForm, LoginFormWithMode } from "./login-form";

export const metadata = {
  title: "Sign in or sign up · Network Growth",
  description: "Sign in to plan and track your professional networking and job search. We never ask for your LinkedIn password.",
  ...canonicalFor("/login"),
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      {/* English paints at once; the person's language replaces it as soon as it is known. */}
      <Suspense fallback={<LoginCard locale="en" searchParams={searchParams} />}>
        <LocalizedLoginCard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LocalizedLoginCard({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  return <LoginCard locale={await getLocale()} searchParams={searchParams} />;
}

function LoginCard({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/login">["searchParams"] }) {
  const t = translator(locale);
  return (
    <I18nProvider locale={locale}>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("auth.title")}</CardTitle>
          <CardDescription>{t("auth.intro")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Suspense fallback={null}>
            <LinkError searchParams={searchParams} locale={locale} />
          </Suspense>
          <Suspense fallback={<LoginForm />}>
            <LoginFormWithMode />
          </Suspense>
          <p className="text-center text-xs text-muted-foreground">
            {t("auth.byContinuing")}{" "}
            <Link href="/terms" className="underline underline-offset-4">{t("auth.terms")}</Link> {t("auth.and")}{" "}
            <Link href="/privacy" className="underline underline-offset-4">{t("auth.privacy")}</Link>.
          </p>
          <div className="flex justify-center">
            <LanguageSwitch />
          </div>
        </CardContent>
      </Card>
    </I18nProvider>
  );
}

// Only the error notice depends on the URL, so the form itself is part of the static
// shell and works the moment it appears. The action reads `next` from the Referer.
async function LinkError({ searchParams, locale }: Pick<PageProps<"/login">, "searchParams"> & { locale: Locale }) {
  const params = await searchParams;
  const t = translator(locale);
  if (params.error === "google") return <FormError>{t("auth.googleUnavailable")}</FormError>;
  if (params.error !== "link") return null;
  return <FormError>{t("auth.linkInvalid")}</FormError>;
}
