"use client";

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DetectedLocaleProvider } from "@/lib/i18n/detected";
import { useT } from "@/lib/i18n/client";
import { LoginForm, LoginFormWithMode } from "./login-form";

/** The sign-in card. English at once, then the person's language in place (see DetectedLocaleProvider). */
export function LoginCard({ notice }: { notice: ReactNode }) {
  return (
    <DetectedLocaleProvider>
      <Card className="w-full max-w-sm">
        <Header />
        <CardContent className="grid gap-3">
          {notice}
          <Suspense fallback={<LoginForm />}>
            <LoginFormWithMode />
          </Suspense>
          <Terms />
          <div className="flex justify-center">
            <LanguageSwitch />
          </div>
        </CardContent>
      </Card>
    </DetectedLocaleProvider>
  );
}

function Header() {
  const t = useT();
  return (
    <CardHeader>
      <CardTitle>{t("auth.title")}</CardTitle>
      <CardDescription>{t("auth.intro")}</CardDescription>
    </CardHeader>
  );
}

function Terms() {
  const t = useT();
  return (
    <p className="text-center text-xs text-muted-foreground">
      {t("auth.byContinuing")}{" "}
      <Link href="/terms" className="underline underline-offset-4">
        {t("auth.terms")}
      </Link>{" "}
      {t("auth.and")}{" "}
      <Link href="/privacy" className="underline underline-offset-4">
        {t("auth.privacy")}
      </Link>
      .
    </p>
  );
}
