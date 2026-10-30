import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CandidateRecord } from "./candidate-record";

export const metadata = { title: "Candidate · Network Growth" };

export default function CandidatePage({ params }: PageProps<"/candidates/[id]">) {
  return (
    <div data-record-page className="grid gap-6">
      <Link href="/candidates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Candidates
      </Link>
      <Suspense fallback={<PageSkeleton label="Loading…" />}>
        <CandidateRecord params={params} />
      </Suspense>
    </div>
  );
}

