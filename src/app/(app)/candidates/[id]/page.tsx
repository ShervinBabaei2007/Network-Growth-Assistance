import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PaneDivider, PaneSignal } from "@/components/master-detail";
import { PageSkeleton } from "@/components/page-skeleton";
import { SPLIT_GRID } from "@/lib/pane";
import { CandidateList } from "../candidate-list";
import { CandidateRecord } from "./candidate-record";

export const metadata = { title: "Candidate · Network Growth" };

/**
 * A candidate opened directly (a link, a reload). On a wide screen the list sits beside the record, as it does when the
 * record is chosen from the list; below that the list is hidden and the record fills the page. Choosing another row
 * hands the layout back to the frame (`data-pane-open`), and this page shrinks to just its list.
 */
export default function CandidatePage({ params, searchParams }: PageProps<"/candidates/[id]">) {
  return (
    <div data-record-page className={`${SPLIT_GRID} xl:group-data-[pane-open]/md:block`}>
      <PaneSignal kind="record" />
      <div className="min-w-0 max-xl:hidden">
        <Suspense fallback={<PageSkeleton label="Loading…" />}>
          <CandidateList searchParams={searchParams} />
        </Suspense>
      </div>
      <PaneDivider className="group-data-[pane-open]/md:hidden" />
      <div className="grid min-w-0 content-start gap-6 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:rounded-xl xl:border xl:bg-card xl:p-4 group-data-[pane-open]/md:hidden">
        <Link href="/candidates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Candidates
        </Link>
        <Suspense fallback={<PageSkeleton label="Loading…" />}>
          <CandidateRecord params={params} />
        </Suspense>
      </div>
    </div>
  );
}
