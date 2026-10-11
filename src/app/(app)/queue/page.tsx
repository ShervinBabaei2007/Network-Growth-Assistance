import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentUserId } from "@/lib/data/dashboard";
import { localDate, startOfLocalDay } from "@/lib/dates";
import { aiNotesEnabled } from "@/lib/notes/claude";
import { DISCIPLINE_LABELS, SHORT_UNIVERSITY, type Discipline } from "@/lib/domain";
import { computeTodaysPlan } from "@/lib/jobs/daily-queue";
import { MIN_RESOLVED_FOR_RATE, type Shortfall } from "@/lib/prioritize";
import { createClient } from "@/lib/supabase/server";
import { markQueueItemSent, rebuildQueue, skipQueueItem } from "./actions";
import { NoteField } from "./note-field";

export const metadata = { title: "Daily Queue · Network Growth" };

export default function QueuePage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold">Daily Queue</h1>
        <p className="text-sm text-muted-foreground">
          Open each profile, send the invitation on LinkedIn yourself, then record it here.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading today&apos;s queue…</p>}>
        <QueueContent />
      </Suspense>
    </div>
  );
}

async function QueueContent() {
  const supabase = await createClient();
  let data;
  try {
    const userId = await currentUserId(supabase);
    const { plan, progress } = await computeTodaysPlan(supabase, userId);
    const { data: settingsRow } = await supabase.from("settings").select("stale_pending_days, timezone").single();
    const [items, settings, stale, notesUsed] = await Promise.all([
      supabase
        .from("daily_queue")
        .select("id, rank, reason, is_alternate, state, note_draft, candidate_id, candidates(full_name, profile_url, role, university, discipline, notes)")
        .eq("queue_date", progress.today)
        .order("rank"),
      supabase.from("settings").select("daily_invite_target, weekly_invite_cap, stale_pending_days, timezone, note_char_limit, monthly_note_allowance").single(),
      loadStalePending(supabase, settingsRow?.stale_pending_days ?? 21),
      countNotesThisMonth(supabase, progress.today, settingsRow?.timezone ?? "America/Vancouver"),
    ]);
    if (items.error || settings.error || stale.error) throw new Error("load");
    data = { plan, progress, items: items.data, settings: settings.data, stale: stale.data, notesUsed };
  } catch (e) {
    unstable_rethrow(e); // let Next.js postpone/redirect signals through
    console.error("[queue] load failed:", e instanceof Error ? e.message : e);
    return <LoadError what="today's queue" />;
  }

  const { plan, progress, items, settings, notesUsed } = data;
  const notesLeft = settings.monthly_note_allowance === null ? null : Math.max(0, settings.monthly_note_allowance - notesUsed);
  const aiEnabled = aiNotesEnabled();
  const tz = settings.timezone;
  const stale = data.stale;
  const open = items.filter((i) => i.state === "queued");
  const done = items.filter((i) => i.state !== "queued");
  const sentToday = progress.activity.sentToday;

  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>Today, {progress.today}</CardDescription>
          <CardTitle>
            {settings.daily_invite_target === null
              ? "Set a daily invitation target to get a queue"
              : `${sentToday} of ${settings.daily_invite_target} planned invitations sent`}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {settings.weekly_invite_cap !== null ? (
            <p className="text-muted-foreground">
              This week: {progress.activity.sentThisWeek} of your {settings.weekly_invite_cap} weekly cap.
            </p>
          ) : null}
          <BlockedNotice blocked={plan.blocked} />
          <p className="text-xs text-muted-foreground">
            Pending invitations are discounted at a{" "}
            {plan.rateIsMeasured
              ? `measured ${Math.round(plan.acceptanceRate * 100)}% acceptance rate`
              : `default ${Math.round(plan.acceptanceRate * 100)}% acceptance rate (measured once ${MIN_RESOLVED_FOR_RATE} invitations have an outcome)`}{" "}
            so categories with many outstanding invites aren&apos;t over-contacted.
          </p>
          <ActionForm action={rebuildQueue} submitLabel={items.length ? "Refresh today's queue" : "Build today's queue"} variant={items.length ? "outline" : "default"} size="sm" />
        </CardContent>
      </Card>

      {open.length > 0 ? (
        <section aria-labelledby="todo" className="grid gap-3">
          <h2 id="todo" className="font-medium">
            To send ({open.length})
          </h2>
          {open.map((item) => {
            const c = item.candidates;
            return (
              <Card key={item.id}>
                <CardContent className="grid gap-3 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid gap-0.5">
                      <p className="font-medium">
                        {item.rank}.{" "}
                        <Link href={`/candidates/${item.candidate_id}`} className="underline-offset-4 hover:underline">
                          {c.full_name}
                        </Link>{" "}
                        {item.is_alternate ? <Badge variant="outline">Alternate</Badge> : null}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {c.university ? SHORT_UNIVERSITY[c.university] : "?"} · {c.discipline ? DISCIPLINE_LABELS[c.discipline] : "?"}
                        {c.role ? ` · ${c.role}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.reason}</p>
                    </div>
                    <a
                      href={c.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Open on LinkedIn <ExternalLink aria-hidden />
                    </a>
                  </div>
                  {c.notes ? <p className="text-sm">Your notes: {c.notes}</p> : null}
                  <div className="flex flex-wrap items-end gap-3">
                    <ActionForm action={markQueueItemSent} submitLabel="Mark sent" size="sm" className="min-w-0 flex-1">
                      <input type="hidden" name="queueId" value={item.id} />
                      <input type="hidden" name="candidateId" value={item.candidate_id} />
                      <NoteField
                        id={`note-${item.id}`}
                        queueId={item.id}
                        defaultValue={item.note_draft ?? ""}
                        limit={settings.note_char_limit}
                        aiEnabled={aiEnabled}
                        notesLeft={notesLeft}
                      />
                    </ActionForm>
                    <ActionForm action={skipQueueItem} submitLabel="Skip today" variant="outline" size="sm">
                      <input type="hidden" name="queueId" value={item.id} />
                      <input type="hidden" name="candidateId" value={item.candidate_id} />
                    </ActionForm>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      ) : items.length > 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm">Today&apos;s queue is done. Nice work.</p>
      ) : null}

      {done.length > 0 ? (
        <section aria-labelledby="done" className="grid gap-2">
          <h2 id="done" className="font-medium">
            Done today
          </h2>
          <ul className="grid gap-1 text-sm">
            {done.map((item) => (
              <li key={item.id} className="flex gap-2">
                <Badge variant={item.state === "sent" ? "secondary" : "outline"}>{item.state === "sent" ? "Sent" : "Skipped"}</Badge>
                <Link href={`/candidates/${item.candidate_id}`} className="underline-offset-4 hover:underline">
                  {item.candidates.full_name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.shortfalls.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Categories short of candidates</CardTitle>
            <CardDescription>
              Approved candidates waiting vs. invitations still needed. The queue never fills a
              gap with people outside the target schools and programs.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {groupByDiscipline(plan.shortfalls).map(([discipline, list], i) => (
              <details key={discipline} open={i === 0} className="rounded-md border px-3 py-2">
                <summary className="cursor-pointer font-medium">
                  {DISCIPLINE_LABELS[discipline]} ({list.length})
                </summary>
                <ul className="mt-2 grid gap-2">
                  {list.map((s) => (
                    <li key={`${s.discipline}-${s.university}`}>
                      <span className="font-medium">{s.university ? SHORT_UNIVERSITY[s.university] : "All four schools"}</span>:{" "}
                      {s.available} ready for about {s.invitesWanted} invitations still needed. {s.suggestion}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {stale.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending for over {settings.stale_pending_days} days ({stale.length})</CardTitle>
            <CardDescription>
              Consider withdrawing these on LinkedIn (My Network → Manage → Sent), then mark them
              withdrawn here. Too many old pending invitations can count against your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {stale.slice(0, 25).map((s) => (
                <li key={s.candidate_id}>
                  <Link href={`/candidates/${s.candidate_id}`} className="underline-offset-4 hover:underline">
                    {s.candidates.full_name}
                  </Link>{" "}
                  <span className="text-muted-foreground">sent {localDate(s.sent_at, tz)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function groupByDiscipline(shortfalls: Shortfall[]) {
  const groups = new Map<Discipline, Shortfall[]>();
  for (const s of shortfalls) groups.set(s.discipline, [...(groups.get(s.discipline) ?? []), s]);
  return [...groups.entries()];
}

/** Invitations sent with a personalized note since the 1st of this month (local time). */
async function countNotesThisMonth(supabase: Awaited<ReturnType<typeof createClient>>, today: string, tz: string) {
  const { count, error } = await supabase
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("had_note", true)
    .gte("sent_at", startOfLocalDay(`${today.slice(0, 7)}-01`, tz).toISOString());
  if (error) throw error;
  return count ?? 0;
}

/** Pending invitations sent more than `days` days ago, oldest first. */
function loadStalePending(supabase: Awaited<ReturnType<typeof createClient>>, days: number) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return supabase
    .from("invitations")
    .select("sent_at, candidate_id, candidates(full_name)")
    .eq("outcome", "pending")
    .lt("sent_at", cutoff)
    .order("sent_at")
    .limit(200);
}

function BlockedNotice({ blocked }: { blocked: string | null }) {
  const messages: Record<string, { text: string; href?: string; link?: string }> = {
    paused: { text: "Outreach is paused while you review a LinkedIn warning. No queue is built until you resume.", href: "/settings", link: "Settings" },
    "no-daily-target": { text: "Enter how many invitations you plan to send per day. Nothing is assumed about LinkedIn's limits.", href: "/settings", link: "Set it in Settings" },
    "capacity-reached": { text: "You've reached today's planned number of invitations. Come back tomorrow." },
    "all-targets-met": { text: "Every discipline target is met." },
  };
  const m = blocked ? messages[blocked] : null;
  if (!m) return null;
  return (
    <p role="status" className="rounded-md bg-muted px-3 py-2">
      {m.text}{" "}
      {m.href ? (
        <Link href={m.href} className="underline underline-offset-4">
          {m.link}
        </Link>
      ) : null}
    </p>
  );
}
