import { LocaleScope } from "@/components/locale-scope";
import { Suspense } from "react";
import { LoadError } from "@/components/load-error";
import { PageHeaderT } from "@/components/tx";
import { PageSkeleton } from "@/components/page-skeleton";
import { createClient } from "@/lib/supabase/server";
import { HiddenList, type HiddenItem } from "./hidden-list";

export const metadata = { title: "Hidden jobs · Network Growth" };

export default function HiddenJobsPage() {
  return (
    <div className="grid gap-6">
      <PageHeaderT
        back={{ href: "/jobs", label: "pages.backJobs" }}
        title="pages.hidden.title"
        description="pages.hidden.description"
      />
      <Suspense fallback={<PageSkeleton labelKey="loading.hiddenJobs" />}>
        <Hidden />
      </Suspense>
    </div>
  );
}

async function Hidden() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_filters").select("id, kind, pattern").order("created_at", { ascending: false });
  if (error) return <LoadError what="your hidden jobs" />;
  return (
    <LocaleScope groups={["msg"]}>
      <HiddenList items={data as HiddenItem[]} />
    </LocaleScope>
  );
}
