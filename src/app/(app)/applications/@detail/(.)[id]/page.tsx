import { Suspense } from "react";
import { DetailPane } from "@/components/master-detail";
import { PageSkeleton } from "@/components/page-skeleton";
import { ApplicationRecord } from "../../[id]/application-record";

// The record has its own heading and back link, so the pane adds none.
export default function Pane({ params }: { params: Promise<{ id: string }> }) {
  return (
    <DetailPane>
      <Suspense fallback={<PageSkeleton label="Loading the application…" />}>
        <ApplicationRecord params={params} />
      </Suspense>
    </DetailPane>
  );
}
