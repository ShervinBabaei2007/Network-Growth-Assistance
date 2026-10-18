import { Suspense } from "react";
import { LoadError } from "@/components/load-error";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { createClient } from "@/lib/supabase/server";
import { HiddenList, type HiddenItem } from "./hidden-list";

export const metadata = { title: "Hidden jobs · Network Growth" };

export default function HiddenJobsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title="Hidden jobs"
        description="Companies and title words you don’t want to see. They’re left out of your Jobs list and your saved-search alerts. Jobs you saved stay in Saved & applied."
      />
      <Suspense fallback={<PageSkeleton label="Loading hidden jobs…" />}>
        <Hidden />
      </Suspense>
    </div>
  );
}

async function Hidden() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_filters").select("id, kind, pattern").order("created_at", { ascending: false });
  if (error) return <LoadError what="your hidden jobs" />;
  return <HiddenList items={data as HiddenItem[]} />;
}
