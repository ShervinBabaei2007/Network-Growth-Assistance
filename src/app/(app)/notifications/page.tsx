import { Suspense } from "react";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { LoadError } from "@/components/load-error";
import { PageHeader } from "@/components/page-header";
import { formatDateTime, formatDay } from "@/lib/applications/format";
import { localDate } from "@/lib/dates";
import { chunk } from "@/lib/job-postings/service";
import { createClient } from "@/lib/supabase/server";
import { NotificationList, type NotificationItem } from "./notification-list";

export const metadata = { title: "Notifications · Network Growth" };

const LIMIT = 100;

export default function NotificationsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Notifications"
        description="New jobs from your saved searches, due reminders, upcoming interviews and problems with job boards you added. Read notifications are cleared after 90 days."
      />
      <Suspense fallback={<PageSkeleton label="Loading notifications…" />}>
        <Notifications />
      </Suspense>
    </div>
  );
}

async function Notifications() {
  const supabase = await createClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.from("notifications").select("id, kind, title, body, href, created_at, read_at").order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("settings").select("timezone").single(),
  ]);
  if (error) return <LoadError what="your notifications" />;
  const tz = settings?.timezone ?? "UTC";
  if (!data.length) {
    return (
      <EmptyState
        icon={<Bell aria-hidden />}
        title="Nothing yet"
        description="Save a search on the Jobs page with alerts on, and new matching jobs show up here. Reminders and interviews from your applications appear here too."
      />
    );
  }

  // The jobs each alert announced, still listed (a job that has since been removed is left out).
  const alertIds = data.filter((n) => n.kind === "alert").map((n) => n.id);
  const jobsBy = new Map<string, { id: string; title: string; company: string | null }[]>();
  for (const part of chunk(alertIds, 50)) {
    const { data: matches } = await supabase.from("saved_search_matches").select("notification_id, jobs(id, title, company)").in("notification_id", part).limit(1000);
    for (const m of matches ?? []) {
      if (!m.jobs || !m.notification_id) continue;
      const list = jobsBy.get(m.notification_id) ?? [];
      if (list.length < 10) list.push(m.jobs);
      jobsBy.set(m.notification_id, list);
    }
  }

  const today = localDate(new Date(), tz);
  const items: NotificationItem[] = data.map((n) => {
    const day = localDate(n.created_at, tz);
    return {
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      href: n.href,
      when: formatDateTime(n.created_at, tz),
      day: day === today ? "Today" : formatDay(n.created_at, tz),
      read: Boolean(n.read_at),
      jobs: jobsBy.get(n.id) ?? [],
    };
  });
  return <NotificationList items={items} truncated={data.length === LIMIT} />;
}
