import { Suspense } from "react";
import { DetailPane } from "@/components/master-detail";
import { PageSkeleton } from "@/components/page-skeleton";
import { PersonRecord } from "../../[id]/person-record";

export default function Pane({ params }: { params: Promise<{ id: string }> }) {
  return (
    <DetailPane backHref="/people" backLabel="People">
      <Suspense fallback={<PageSkeleton label="Loading…" />}>
        <PersonRecord params={params} />
      </Suspense>
    </DetailPane>
  );
}
