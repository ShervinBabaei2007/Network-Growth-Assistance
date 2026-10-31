import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { RememberLastView } from "@/components/views-menu";
import { PeopleList } from "./people-list";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "People · Network Growth" };


export default function PeoplePage({ searchParams }: PageProps<"/people">) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">People worth meeting</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            People you saved from research, with their status, notes and reminders. Every LinkedIn step is yours to take: open their profile, connect
            if you choose, then record it here.
          </p>
        </div>
        <Link href="/discover" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Discover more
        </Link>
      </div>
      <Suspense fallback={null}>
        <RememberLastView page="people" />
      </Suspense>
      <Suspense fallback={<PageSkeleton label="Loading people…" />}>
        <PeopleList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

