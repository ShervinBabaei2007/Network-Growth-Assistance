import { Suspense } from "react";
import { PaneSignal } from "@/components/master-detail";
import { PageSkeleton } from "@/components/page-skeleton";
import { ApplicationRecord } from "./application-record";

export const metadata = { title: "Application · Network Growth" };

export default function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  return (
    <div data-record-page>
      <PaneSignal kind="record" />
      <Suspense fallback={<PageSkeleton labelKey="loading.application" />}>
        <ApplicationRecord params={params} />
      </Suspense>
    </div>
  );
}
