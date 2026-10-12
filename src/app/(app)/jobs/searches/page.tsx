import { Suspense } from "react";
import Link from "next/link";
import { LoadError } from "@/components/load-error";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/applications/format";
import { emailConfigured } from "@/lib/email/mailer";
import { FeedQuery, toSearchParams } from "@/lib/job-postings/feed-query";
import { createClient } from "@/lib/supabase/server";
import { SearchList, type SearchItem } from "./search-list";

export const metadata = { title: "Saved searches · Network Growth" };

export default function SavedSearchesPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title="Saved searches"
        description="Searches you come back to, with optional alerts when new matching jobs appear. Save one from the Jobs page."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading saved searches…</p>}>
        <Searches />
      </Suspense>
    </div>
  );
}

async function Searches() {
  const supabase = await createClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.from("saved_searches").select("id, name, query, alert_frequency, alert_weekday, alert_hour, email_digest, last_run_at, next_run_at, last_error, created_at").order("created_at"),
    supabase.from("settings").select("timezone, email_notifications").single(),
  ]);
  if (error) return <LoadError what="your saved searches" />;
  const tz = settings?.timezone ?? "UTC";
  if (!data.length) {
    return (
      <div className="grid justify-items-start gap-3 rounded-xl border border-dashed p-6">
        <h2 className="font-medium">No saved searches yet</h2>
        <p className="max-w-prose text-sm text-muted-foreground">Search on the Jobs page, then choose “Save this search”. You can be told daily or weekly when new matching jobs appear.</p>
        <Link href="/jobs" className={buttonVariants({ size: "sm" })}>
          Go to Jobs
        </Link>
      </div>
    );
  }
  const items: SearchItem[] = data.map((s) => {
    const q = FeedQuery.safeParse(s.query);
    return {
      id: s.id,
      href: q.success ? `/jobs?${toSearchParams(q.data)}` : "/jobs",
      value: { name: s.name, frequency: s.alert_frequency as SearchItem["value"]["frequency"], weekday: s.alert_weekday, hour: s.alert_hour, emailDigest: s.email_digest },
      lastRun: s.last_run_at ? formatDateTime(s.last_run_at, tz) : null,
      nextRun: s.next_run_at && s.alert_frequency !== "off" ? formatDateTime(s.next_run_at, tz) : null,
      error: s.last_error,
    };
  });
  return (
    <>
      {!settings?.email_notifications && items.some((i) => i.value.emailDigest) ? (
        <p role="status" className="rounded-lg border bg-muted/50 p-3 text-sm">
          Some searches ask for email, but email is off in{" "}
          <Link href="/settings#notifications" className="text-primary underline-offset-4 hover:underline">
            Settings → Notifications
          </Link>
          . Until you turn it on, alerts appear only in the app.
        </p>
      ) : null}
      <SearchList items={items} emailAvailable={emailConfigured()} timeZone={tz} />
    </>
  );
}
