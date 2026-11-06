import { Suspense } from "react";
import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { LoadError } from "@/components/load-error";
import { Disclosure } from "@/components/disclosure";
import { PageHeaderT, Tx } from "@/components/tx";
import { RememberLastView, type SavedView } from "@/components/views-menu";
import { SavedViews } from "@/components/saved-views";
import { buttonVariants } from "@/components/ui/button";
import { formatDateOnly, formatDay, formatDateTime } from "@/lib/applications/format";
import { LIST_LIMIT, loadApplications } from "@/lib/applications/load";
import { suggestNoResponse } from "@/lib/applications/no-response";
import { parseSort, sortApplications } from "@/lib/applications/sort";
import { createClient } from "@/lib/supabase/server";
import { LocaleScope } from "@/components/locale-scope";
import { getLocale, getT } from "@/lib/i18n/server";
import { Tracker, type TrackerApp } from "./tracker";

export const metadata = { title: "Applications · Network Growth" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  return (
    <div className="grid gap-6">
      <PageHeaderT
        title="pages.applications.title"
        description="pages.applications.description"
        actions={
          <Link href="/jobs" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Tx k="applicationsPage.findJobs" />
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton labelKey="loading.applications" />}>
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
  const [loaded, { data: settings }, { data: viewRows }] = await Promise.all([
    loadApplications(supabase),
    supabase.from("settings").select("timezone, no_response_days").single(),
    supabase.from("saved_views").select("id, name, query").eq("page", "applications").order("created_at"),
  ]);
  const views: SavedView[] = viewRows ?? [];
  if (!loaded) return <LoadError what="your applications" />;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const tz = settings?.timezone ?? "UTC";
  const afterDays = settings?.no_response_days ?? 21;
  const now = new Date();

  if (!loaded.apps.length) {
    return (
      <EmptyState
        icon={<ClipboardList aria-hidden />}
        title={t("applicationsPage.emptyTitle")}
        description={t("applicationsPage.emptyDesc")}
      >
        <Link href="/jobs" className={buttonVariants({ size: "sm" })}>
          {t("applicationsPage.browseJobs")}
        </Link>
      </EmptyState>
    );
  }

  const apps: TrackerApp[] = sortApplications(loaded.apps, sort.key, sort.dir).map((a) => ({
    ...a,
    changedLabel: formatDay(a.stageChangedAt, tz, locale),
    appliedLabel: a.appliedOn ? formatDateOnly(a.appliedOn, locale) : null,
    nextInterviewLabel: a.nextInterviewAt ? formatDateTime(a.nextInterviewAt, tz, locale) : null,
  }));
  const quiet = suggestNoResponse(loaded.apps, afterDays, now).map((a) => ({ id: a.id, title: a.title, company: a.company, days: a.days, stage: a.stage, version: a.version }));

  return (
    <>
      <RememberLastView page="applications" />
      {loaded.truncated ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("applicationsPage.truncated", { limit: LIST_LIMIT })}
        </p>
      ) : null}
      <LocaleScope groups={["list", "stage", "applicationsPage"]}>
        <Tracker apps={apps} view={view} sort={sort} quiet={quiet} afterDays={afterDays} />
      </LocaleScope>
      <Disclosure id="views" summary={views.length ? t("list.savedViewsCount", { count: views.length }) : t("list.savedViews")}>
        <SavedViews page="applications" views={views} />
      </Disclosure>
    </>
  );
}
