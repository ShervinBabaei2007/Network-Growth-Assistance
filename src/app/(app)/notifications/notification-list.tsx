"use client";

import Link from "next/link";
import { AlarmClock, BellRing, Briefcase, CalendarClock, CheckCheck, MessageCircleHeart, TriangleAlert } from "lucide-react";
import { markAllRead, markUnread, setNotificationRead } from "@/app/(app)/jobs/searches/actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  when: string;
  day: string;
  read: boolean;
  jobs: { id: string; title: string; company: string | null }[];
};

const ICON: Record<string, typeof BellRing> = { alert: Briefcase, reminder: AlarmClock, interview: CalendarClock, source_problem: TriangleAlert, weekly_summary: BellRing, follow_up: MessageCircleHeart };

export function NotificationList({ items, truncated }: { items: NotificationItem[]; truncated: boolean }) {
  const { pending, run } = useActionRunner();
  const unread = items.filter((i) => !i.read).length;
  const days = [...new Set(items.map((i) => i.day))];
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {unread ? `${unread} unread` : "All read"}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !unread}
          onClick={() => {
            let ids: string[] = [];
            run(
              async () => {
                const r = await markAllRead();
                if (r.ok) ids = r.data?.ids ?? [];
                return r;
              },
              { undo: () => markUnread(ids) },
            );
          }}
        >
          <CheckCheck aria-hidden /> Mark all read
        </Button>
      </div>
      {days.map((day) => (
        <section key={day} aria-labelledby={`day-${day}`} className="grid gap-2">
          <h2 id={`day-${day}`} className="text-sm font-medium text-muted-foreground">
            {day}
          </h2>
          <ul className="grid gap-2">
            {items
              .filter((i) => i.day === day)
              .map((n) => {
                const Icon = ICON[n.kind] ?? BellRing;
                return (
                  <li key={n.id} className={cn("grid gap-2 rounded-xl border bg-card p-3 text-sm", !n.read && "border-primary/40 bg-accent/40")}>
                    <div className="flex items-start gap-3">
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <p className="font-medium break-words">
                          {!n.read ? <span className="sr-only">Unread: </span> : null}
                          {n.href ? (
                            <Link href={n.href} className="hover:underline" onClick={() => !n.read && run(() => setNotificationRead(n.id, true), { quiet: true })}>
                              {n.title}
                            </Link>
                          ) : (
                            n.title
                          )}
                        </p>
                        {n.body ? <p className="break-words text-muted-foreground">{n.body}</p> : null}
                        <p className="text-xs text-muted-foreground">{n.when}</p>
                      </div>
                      <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => setNotificationRead(n.id, !n.read), { quiet: true })}>
                        {n.read ? "Mark unread" : "Mark read"}
                      </Button>
                    </div>
                    {n.jobs.length ? (
                      <ul className="ml-7 grid gap-1">
                        {n.jobs.map((j) => (
                          <li key={j.id}>
                            <Link href={`/jobs/${j.id}`} className="text-primary hover:underline">
                              {j.title}
                            </Link>
                            {j.company ? <span className="text-muted-foreground"> · {j.company}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      {truncated ? <p className="text-xs text-muted-foreground">Showing the 100 most recent.</p> : null}
    </div>
  );
}
