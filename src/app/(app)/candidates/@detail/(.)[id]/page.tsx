import { Suspense } from "react";
import { DetailPane } from "@/components/master-detail";
import { PageSkeleton } from "@/components/page-skeleton";
import { CandidateRecord } from "../../[id]/candidate-record";

export default function Pane({ params }: { params: Promise<{ id: string }> }) {
  return (
    <DetailPane backHref="/candidates" backLabel="Candidates">
      <Suspense fallback={<PageSkeleton label="Loading…" />}>
        <CandidateRecord params={params} />
      </Suspense>
    </DetailPane>
  );
}
