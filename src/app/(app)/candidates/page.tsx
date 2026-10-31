import { unstable_rethrow } from "next/navigation";
import { Disclosure } from "@/components/disclosure";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/page-skeleton";
import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCatalog } from "@/lib/data/catalog";
import { loadMyProgress } from "@/lib/data/dashboard";
import { searchLinks } from "@/lib/prioritize/search-links";
import { createClient } from "@/lib/supabase/server";
import { CandidateList } from "./candidate-list";
import { QuickAddForm } from "./quick-add";
import { QuickCapture } from "./quick-capture";
import { RememberLastView } from "@/components/views-menu";

export const metadata = { title: "Candidates · Network Growth" };

export default function CandidatesPage({ searchParams }: PageProps<"/candidates">) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">Candidates</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            LinkedIn search results you paste in, tracked from review to invitation to acceptance. Accepted candidates count toward your targets.
            Looking for people to research instead? Try Discover.
          </p>
        </div>
        <Link href="/candidates/import" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Upload aria-hidden /> Import
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick capture from LinkedIn search</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Suspense fallback={null}>
            <SearchShortcuts />
            <QuickCaptureForUser />
          </Suspense>
        </CardContent>
      </Card>

      <Disclosure id="add" summary="Add one person by hand">
            <QuickAddForm />
      </Disclosure>

      <Suspense fallback={null}>
        <RememberLastView page="candidates" />
      </Suspense>

      <Suspense fallback={<PageSkeleton label="Loading candidates…" />}>
        <CandidateList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function QuickCaptureForUser() {
  const supabase = await createClient();
  const [{ data }, catalog] = await Promise.all([supabase.from("settings").select("auto_approve").single(), loadCatalog(supabase)]);
  return <QuickCapture catalog={catalog} autoApprove={data?.auto_approve ?? false} />;
}

/** One-click LinkedIn searches for the categories that still need people, most important first. */
async function SearchShortcuts() {
  let links;
  try {
    const progress = await loadMyProgress();
    links = searchLinks(progress.disciplines, progress.catalog);
  } catch (e) {
    unstable_rethrow(e);
    return null; // shortcuts are a convenience; the paste box still works without them
  }
  if (links.length === 0) return null;

  return (
    <nav aria-label="LinkedIn search shortcuts" className="grid gap-2">
      <p className="text-sm font-medium">1. Open a search on LinkedIn</p>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={`${l.discipline}-${l.university}`}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              // Long labels wrap on a phone instead of running off the screen.
              className={cn(buttonVariants({ variant: l.isAlternate ? "ghost" : "outline", size: "sm" }), "h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal")}
            >
              {l.label}
              {l.remaining !== null ? <span className="text-muted-foreground">· {l.remaining} to go</span> : <span className="text-muted-foreground">· extra</span>}
              <ExternalLink aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium">2. Press Ctrl+A, Ctrl+C there, then paste below</p>
    </nav>
  );
}
