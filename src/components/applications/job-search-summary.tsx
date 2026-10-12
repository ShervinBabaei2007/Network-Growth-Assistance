import Link from "next/link";
import { ReminderDoneButton } from "@/components/applications/reminder-done";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, relativeDays } from "@/lib/applications/format";
import { loadApplications, loadDueReminders } from "@/lib/applications/load";
import { suggestNoResponse } from "@/lib/applications/no-response";
import { isClosed } from "@/lib/applications/stages";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const WEEK_MS = 7 * 86_400_000;

/** Overview: what needs doing in the job search this week. Hidden until something is tracked. */
export async function JobSearchSummary() {
  const supabase = await createClient();
  const now = new Date();
  const [loaded, reminders, { data: settings }, { data: interviews }] = await Promise.all([
    loadApplications(supabase),
    loadDueReminders(supabase, new Date(now.getTime() + WEEK_MS)),
    supabase.from("settings").select("timezone, no_response_days").single(),
    supabase
      .from("application_interviews")
      .select("id, application_id, starts_at, kind, applications(title, company)")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", new Date(now.getTime() + WEEK_MS).toISOString())
      .order("starts_at")
      .limit(10),
  ]);
  if (!loaded || !reminders) return null;
  if (!loaded.apps.length) return null;
  const tz = settings?.timezone ?? "America/Vancouver";
  const open = loaded.apps.filter((a) => !isClosed(a.stage)).length;
  const quiet = suggestNoResponse(loaded.apps, settings?.no_response_days ?? 21, now).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job search</CardTitle>
        <CardDescription>
          {open} open application{open === 1 ? "" : "s"}
          {quiet ? ` · ${quiet} with no reply for a while` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="due-reminders" className="grid content-start gap-2">
          <h3 id="due-reminders" className="text-sm font-medium">
            Reminders due this week
          </h3>
          {reminders.length ? (
            <ul className="grid gap-2">
              {reminders.map((r) => {
                const overdue = Date.parse(r.dueAt) < now.getTime();
                return (
                  <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="break-words">{r.text}</span>
                      <span className="block text-xs text-muted-foreground">
                        <Link href={`/applications/${r.applicationId}`} className="hover:underline">
                          {r.title}
                          {r.company ? ` · ${r.company}` : ""}
                        </Link>
                        {" · "}
                        <span className={cn(overdue && "font-medium text-destructive")}>{overdue ? `Overdue, ${relativeDays(r.dueAt, tz, now)}` : formatDateTime(r.dueAt, tz)}</span>
                      </span>
                    </span>
                    <ReminderDoneButton id={r.id} text={r.text} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing due.</p>
          )}
        </section>
        <section aria-labelledby="upcoming-interviews" className="grid content-start gap-2">
          <h3 id="upcoming-interviews" className="text-sm font-medium">
            Interviews in the next 7 days
          </h3>
          {interviews?.length ? (
            <ul className="grid gap-2 text-sm">
              {interviews.map((i) => (
                <li key={i.id}>
                  <Link href={`/applications/${i.application_id}`} className="font-medium hover:underline">
                    {i.applications?.title ?? "Interview"}
                  </Link>
                  {i.applications?.company ? <span className="text-muted-foreground"> · {i.applications.company}</span> : null}
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(i.starts_at, tz)} ({relativeDays(i.starts_at, tz, now)})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None scheduled.</p>
          )}
          <Link href="/applications" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1 justify-self-start")}>
            Open Applications
          </Link>
        </section>
      </CardContent>
    </Card>
  );
}
