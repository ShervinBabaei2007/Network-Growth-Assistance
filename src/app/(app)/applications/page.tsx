import { Suspense } from "react";
import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { LoadError } from "@/components/load-error";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatDateOnly, formatDay, formatDateTime } from "@/lib/applications/format";
import { LIST_LIMIT, loadApplications } from "@/lib/applications/load";
import { suggestNoResponse } from "@/lib/applications/no-response";
import { parseSort, sortApplications } from "@/lib/applications/sort";
import { createClient } from "@/lib/supabase/server";
import { Tracker, type TrackerApp } from "./tracker";

export const metadata = { title: "Applications · Network Growth" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Applications"
        description="Every job you're pursuing, from saved to offer."
        actions={
          <Link href="/jobs" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Find jobs
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton label="Loading applications…" />}>
        <ApplicationsView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ApplicationsView({ searchParams }: Pick<PageProps<"/applications">, "searchParams">) {
  const sp = await searchParams;
  const view = one(sp.view) === "list" ? "list" : "board";
  const sort = parseSort(one(sp.sort) || undefined, one(sp.dir) || undefined);

  const supabase = await createClient();
  const [loaded, { data: settings }] = await Promise.all([loadApplications(supabase), supabase.from("settings").select("timezone, no_response_days").single()]);
  if (!loaded) return <LoadError what="your applications" />;
  const tz = settings?.timezone ?? "UTC";
  const afterDays = settings?.no_response_days ?? 21;
  const now = new Date();

  if (!loaded.apps.length) {
    return (
      <EmptyState
        icon={<ClipboardList aria-hidden />}
        title="No applications yet"
        description="Save a job or mark it as applied from Jobs, and it appears here. You can then move it through screening, interviews and offers, and keep notes, reminders and the documents you sent."
      >
        <Link href="/jobs" className={buttonVariants({ size: "sm" })}>
          Browse jobs
        </Link>
      </EmptyState>
    );
  }

  const apps: TrackerApp[] = sortApplications(loaded.apps, sort.key, sort.dir).map((a) => ({
    ...a,
    changedLabel: formatDay(a.stageChangedAt, tz),
    appliedLabel: a.appliedOn ? formatDateOnly(a.appliedOn) : null,
    nextInterviewLabel: a.nextInterviewAt ? formatDateTime(a.nextInterviewAt, tz) : null,
  }));
  const quiet = suggestNoResponse(loaded.apps, afterDays, now).map((a) => ({ id: a.id, title: a.title, company: a.company, days: a.days, stage: a.stage, version: a.version }));

  return (
    <>
      {loaded.truncated ? (
        <p role="status" className="text-sm text-muted-foreground">
          Showing your {LIST_LIMIT} most recently changed applications.
        </p>
      ) : null}
      <Tracker apps={apps} view={view} sort={sort} quiet={quiet} afterDays={afterDays} />
    </>
  );
}
