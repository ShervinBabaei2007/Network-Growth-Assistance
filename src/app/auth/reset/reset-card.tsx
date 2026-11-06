"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/core";
import { DetectedLocaleProvider } from "@/lib/i18n/detected";
import { ResetForm } from "./reset-form";

/** The new-password card. English at once, then the person's language in place. */
export function ResetCard({ english }: { english: Messages }) {
  return (
    <DetectedLocaleProvider english={english}>
      <Card className="w-full max-w-sm">
        <Header />
        <CardContent>
          <ResetForm />
        </CardContent>
      </Card>
    </DetectedLocaleProvider>
  );
}

function Header() {
  const t = useT();
  return (
    <CardHeader>
      <CardTitle>{t("auth.resetTitle")}</CardTitle>
      <CardDescription>{t("auth.resetIntro")}</CardDescription>
    </CardHeader>
  );
}
