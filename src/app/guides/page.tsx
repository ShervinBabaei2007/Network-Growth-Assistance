import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/footer";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GUIDES } from "@/lib/guides";
import { canonicalFor } from "@/lib/site";

export const metadata = {
  title: "Guides · Network Growth",
  description: "Short how-to guides: export your LinkedIn connections, build a networking plan and track job applications.",
  ...canonicalFor("/guides"),
};

export default function GuidesPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-10">
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">← Network Growth</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Guides</h1>
        <p className="mt-2 text-muted-foreground">Short, practical steps. None of them need your LinkedIn password.</p>
        <ul className="mt-6 grid gap-3">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <Card size="sm" className="hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{g.title}</CardTitle>
                    <CardDescription>{g.summary}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <MarketingFooter />
    </div>
  );
}
