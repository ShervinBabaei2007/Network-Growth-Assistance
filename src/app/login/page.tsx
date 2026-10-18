import { FormError } from "@/components/form-error";
import { canonicalFor } from "@/lib/site";
import { Suspense } from "react";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { LoginCard } from "./login-card";

export const metadata = {
  title: "Sign in or sign up · Network Growth",
  description: "Sign in to plan and track your professional networking and job search. We never ask for your LinkedIn password.",
  ...canonicalFor("/login"),
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <LoginCard
        notice={
          <Suspense fallback={null}>
            <LinkError searchParams={searchParams} />
          </Suspense>
        }
      />
    </main>
  );
}

// Only the error notice depends on the URL and the language, so the card itself is part of the static
// shell and works the moment it appears. The action reads `next` from the Referer.
async function LinkError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  if (params.error !== "google" && params.error !== "link") return null;
  const t = translator(await getLocale());
  return <FormError>{params.error === "google" ? t("auth.googleUnavailable") : t("auth.linkInvalid")}</FormError>;
}
