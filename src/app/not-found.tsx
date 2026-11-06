import { Suspense } from "react";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <Suspense fallback={null}>
        <NotFoundText />
      </Suspense>
    </main>
  );
}

async function NotFoundText() {
  const t = await getT();
  return (
    <>
      <h1 className="text-xl font-semibold">{t("notFound.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("notFound.body")}</p>
      <Link href="/overview" className="text-sm underline underline-offset-4">
        {t("notFound.back")}
      </Link>
    </>
  );
}
