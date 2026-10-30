import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PersonRecord } from "./person-record";

export const metadata = { title: "Person · Network Growth" };

export default function PersonPage({ params }: PageProps<"/people/[id]">) {
  return (
    <div data-record-page className="grid max-w-3xl gap-6">
      <Link href="/people" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> People
      </Link>
      <Suspense fallback={<PageSkeleton label="Loading…" />}>
        <PersonRecord params={params} />
      </Suspense>
    </div>
  );
}

