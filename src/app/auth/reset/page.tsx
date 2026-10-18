import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { translator, type Locale } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password · Network Growth", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Suspense fallback={<ResetCard locale="en" />}>
        <LocalizedResetCard />
      </Suspense>
    </main>
  );
}

async function LocalizedResetCard() {
  return <ResetCard locale={await getLocale()} />;
}

function ResetCard({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <I18nProvider locale={locale}>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("auth.resetTitle")}</CardTitle>
          <CardDescription>{t("auth.resetIntro")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetForm />
        </CardContent>
      </Card>
    </I18nProvider>
  );
}
