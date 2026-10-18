import { Suspense, type ReactNode } from "react";
import { Field as FieldBox, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  moveDiscipline,
  pauseOutreach,
  resumeOutreach,
  runDailyJobNow,
  saveCategory,
  deleteAccount,
  updateNoteProfile,
  updateGoal,
  updatePlanning,
  updateTargets,
  updateTrackerSettings,
} from "@/app/(app)/actions";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { loadCatalog } from "@/lib/data/catalog";
import { targetUniversities } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { normalizeAppearance } from "@/lib/appearance";
import { updateNotificationSettings } from "@/app/(app)/jobs/searches/actions";
import { emailConfigured } from "@/lib/email/mailer";
import { AiKeySection } from "./ai-key-section";
import { AppearanceForm } from "./appearance-form";
import { DeleteCategoryButton } from "./category-delete";
import { LazyEdit } from "./lazy-edit";
import { TimeZoneInput } from "./timezone-input";

export const metadata = { title: "Settings · Network Growth" };

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      {/* One boundary for the whole page, so the AI-key card can't appear under the skeleton and then be pushed down. */}
      <Suspense fallback={<PageSkeleton label="Loading…" />}>
        <SettingsContent />
        <AiKeySection />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  const supabase = await createClient();
  const [{ data: s, error }, { data: targets }, { data: runs }, catalog] = await Promise.all([
    supabase.from("settings").select("*").single(),
    supabase.from("targets").select("discipline, university, target_count"),
    supabase.from("job_runs").select("run_date, status, stats, error, finished_at").order("run_date", { ascending: false }).limit(7),
    loadCatalog(supabase),
  ]);
  if (error || !s) return <LoadError what="your settings" />;

  const targetValue = (d: string, u: string | null) =>
    targets?.find((t) => t.discipline === d && t.university === u)?.target_count ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section
        id="plan"
        title="Your networking plan"
        description="The schools and disciplines you want to connect with, in your own words, and your goals. Nothing is built in: candidates are sorted only into what you add here."
        className="lg:col-span-2"
      >
        <div className="grid gap-6">
          <ActionForm action={updateGoal} submitLabel="Save goal">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="overallTarget" label="Connection goal (total)">
                <Input id="overallTarget" name="overallTarget" type="number" min={1} max={30000} defaultValue={s.overall_target ?? ""} placeholder="Not set" />
              </Field>
              <Field id="baselineSetting" label="Starting count">
                <Input id="baselineSetting" name="baseline" type="number" min={0} max={30000} defaultValue={s.baseline_connections ?? ""} />
              </Field>
              <Field id="startDateSetting" label="Start date">
                <Input id="startDateSetting" name="startDate" type="date" defaultValue={s.project_start_date} required />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Growth is measured from your starting count. Only acceptances on or after the start date count toward your targets.</p>
          </ActionForm>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid content-start gap-3">
              <h2 className="text-sm font-semibold">Schools</h2>
              <p className="text-xs text-muted-foreground">
                Universities, colleges or any institution. List the other ways people write it (short forms, campuses) so profiles are matched to it.
                Schools with their own targets get a share of each discipline&apos;s goal; the others add extra candidates.
              </p>
              {catalog.universities.length ? (
                <ul className="grid gap-2">
                  {catalog.universities.map((u) => (
                    <CategoryRow key={u.id} kind="university" entry={u} hasTargets={u.hasTargets} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No schools yet. Add the first one below.</p>
              )}
              <CategoryForm kind="university" />
            </div>
            <div className="grid content-start gap-3">
              <h2 className="text-sm font-semibold">Disciplines, in priority order</h2>
              <p className="text-xs text-muted-foreground">
                Any field of study or work: nursing, law, finance, software, design, trades… Attention moves down this list as each target is met.
              </p>
              {catalog.disciplines.length ? (
                <ol className="grid gap-2">
                  {catalog.disciplines.map((d, i) => (
                    <CategoryRow key={d.id} kind="discipline" entry={d} rank={i + 1} first={i === 0} last={i === catalog.disciplines.length - 1} />
                  ))}
                </ol>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No disciplines yet. Add the first one below.</p>
              )}
              <CategoryForm kind="discipline" />
            </div>
          </div>

          <div className="grid gap-3">
            <h2 className="text-sm font-semibold">Targets</h2>
            {catalog.disciplines.length ? (
              <ActionForm action={updateTargets} submitLabel="Save targets">
                <p className="text-xs text-muted-foreground">New accepted connections per discipline, and the share from each school with its own targets. Leave a field empty for no target there.</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {catalog.disciplines.map((d) => (
                    <fieldset key={d.id} className="grid gap-2 rounded-md border p-3">
                      <legend className="px-1 text-sm font-medium">{d.name}</legend>
                      {[{ key: "total", id: null as string | null, label: "Total" }, ...targetUniversities(catalog).map((u) => ({ key: u.id, id: u.id as string | null, label: u.name }))].map((t) => (
                        <Field key={t.key} id={`${d.id}.${t.key}`} label={t.label} inline>
                          <Input id={`${d.id}.${t.key}`} name={`${d.id}.${t.key}`} type="number" min={0} max={30000} defaultValue={targetValue(d.id, t.id) ?? ""} placeholder="—" className="w-24" />
                        </Field>
                      ))}
                    </fieldset>
                  ))}
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted-foreground">Add a discipline first; then set how many new connections you want in it.</p>
            )}
          </div>
        </div>
      </Section>
      <Section title="Help and setup guide" description="Replay the introduction or the tour, or see which page is for what.">
        <Link href="/help" className={buttonVariants({ variant: "outline" })}>
          Open Help
        </Link>
      </Section>
      <Section title="Appearance" description="How the app looks on every device you sign in on.">
        <AppearanceForm initial={normalizeAppearance({ theme: s.theme, density: s.density, text: s.text_size })} />
      </Section>
      <Section title="Applications" description="When to suggest marking an application “No response”. Nothing is changed automatically.">
        <ActionForm action={updateTrackerSettings} submitLabel="Save">
          <Field id="noResponseDays" label="Suggest after this many days without a reply">
            <Input id="noResponseDays" name="noResponseDays" type="number" min={1} max={365} defaultValue={s.no_response_days} required className="w-28" />
          </Field>
        </ActionForm>
      </Section>
      <Section id="notifications" title="Notifications" description="What appears in your notifications (the bell at the top). Saved-search alerts are set on each search.">
        <ActionForm action={updateNotificationSettings} submitLabel="Save">
          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox name="notifyReminders" defaultChecked={s.notify_reminders} /> Reminders when they&apos;re due
            </label>
            <label className="flex items-center gap-2">
              <Checkbox name="notifyInterviews" defaultChecked={s.notify_interviews} /> Interviews in the next 24 hours
            </label>
            <label className="flex items-center gap-2">
              <Checkbox name="weeklySummary" defaultChecked={s.weekly_summary} /> A summary of my job search every Monday
            </label>
            {emailConfigured() ? (
              <label className="flex items-center gap-2">
                <Checkbox name="emailNotifications" defaultChecked={s.email_notifications} /> Allow alert emails (each saved search also has its own email switch)
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">Email isn&apos;t set up on this server, so alerts appear only in the app.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Emails list job titles, companies and links only, with no tracking. Every email has a one-click unsubscribe link. Read notifications are deleted after 90 days.
            </p>
          </div>
        </ActionForm>
      </Section>
      <Section title="Pause outreach" description="Use this if LinkedIn shows a warning, a restriction or an invitation limit.">
        {s.paused ? (
          <div className="grid gap-3">
            <p className="text-sm">
              Paused since {s.paused_at ? new Date(s.paused_at).toLocaleString("en-CA") : "—"}.
              {s.pause_reason ? ` Reason: ${s.pause_reason}` : ""}
            </p>
            <ActionForm action={resumeOutreach} submitLabel="Resume outreach" variant="outline" />
          </div>
        ) : (
          <ActionForm action={pauseOutreach} submitLabel="Pause outreach" variant="destructive">
            <Field id="reason" label="What did LinkedIn show? (optional)">
              <Textarea id="reason" name="reason" maxLength={500} rows={2} />
            </Field>
          </ActionForm>
        )}
      </Section>

      <Section
        title="Daily planning"
        description="LinkedIn's limits vary by account and change over time, so nothing is assumed. Enter what you plan to do and any limits LinkedIn has shown you."
      >
        <ActionForm action={updatePlanning} submitLabel="Save planning">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="dailyInviteTarget" label="Invitations you plan to send per day">
              <Input id="dailyInviteTarget" name="dailyInviteTarget" type="number" min={0} max={1000} defaultValue={s.daily_invite_target ?? ""} placeholder="Not set" />
            </Field>
            <Field id="weeklyInviteCap" label="Weekly invitation cap (optional)">
              <Input id="weeklyInviteCap" name="weeklyInviteCap" type="number" min={0} max={5000} defaultValue={s.weekly_invite_cap ?? ""} placeholder="None" />
            </Field>
            <Field id="monthlyNoteAllowance" label="Personalized notes per month (optional)">
              <Input id="monthlyNoteAllowance" name="monthlyNoteAllowance" type="number" min={0} max={1000} defaultValue={s.monthly_note_allowance ?? ""} placeholder="Unknown" />
            </Field>
            <Field id="noteCharLimit" label="Note length limit (characters)">
              <Input id="noteCharLimit" name="noteCharLimit" type="number" min={1} max={1000} defaultValue={s.note_char_limit} required />
            </Field>
            <Field id="stalePendingDays" label="Flag pending invitations after (days)">
              <Input id="stalePendingDays" name="stalePendingDays" type="number" min={1} max={365} defaultValue={s.stale_pending_days} required />
            </Field>
            <Field id="timezone" label="Time zone">
              <TimeZoneInput id="timezone" defaultValue={s.timezone} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="autoApprove" defaultChecked={s.auto_approve} className="mt-0.5" />
            <span>
              Approve automatically when school and program are recognised
              <span className="block text-xs text-muted-foreground">
                Skips the review step for clear matches. Unclear ones still wait for you.
              </span>
            </span>
          </label>
        </ActionForm>
      </Section>

      <Section
        title="About you (for connection notes)"
        description="Suggested notes only mention what you enter here and what's on the candidate's record. Nothing is invented."
      >
        <ActionForm action={updateNoteProfile} submitLabel="Save">
          <Field id="mySchool" label="Your school">
            <Input id="mySchool" name="mySchool" maxLength={200} defaultValue={s.my_school_text ?? ""} placeholder="Your school, college or employer" />
          </Field>
          <Field id="myProgram" label="Your program">
            <Input id="myProgram" name="myProgram" maxLength={200} defaultValue={s.my_program_text ?? ""} placeholder="Your program or field" />
          </Field>
          <Field id="myInterests" label="Interests to mention (optional)">
            <Input id="myInterests" name="myInterests" maxLength={300} defaultValue={s.my_interests ?? ""} placeholder="Topics you care about" />
          </Field>
        </ActionForm>
      </Section>

      <Section
        title="Daily job"
        description="Runs once a day on the server: classifies new candidates, marks older invitations as pending, rebuilds the queue and checks for shortfalls. It never contacts LinkedIn."
      >
        <div className="grid gap-3 text-sm">
          {runs && runs.length > 0 ? (
            <ul className="grid gap-1">
              {runs.map((r) => {
                const st = r.stats as { queued?: number; reclassified?: number } | null;
                return (
                  <li key={r.run_date}>
                    <span className="font-medium">{r.run_date}</span> · {r.status}
                    {r.status === "succeeded" && st ? ` · ${st.queued ?? 0} queued, ${st.reclassified ?? 0} classified` : ""}
                    {r.status === "failed" && r.error ? ` · ${r.error}` : ""}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground">No runs yet.</p>
          )}
          <ActionForm action={runDailyJobNow} submitLabel="Run now" variant="outline" size="sm" />
        </div>
      </Section>

      <Section
        title="Your data"
        description="Everything is stored only for your account. Your LinkedIn password, cookies and export email addresses are never stored."
      >
        <div className="grid gap-4 text-sm">
          <a href="/api/export" className="underline underline-offset-4" download>
            Download all my data (JSON)
          </a>
          <ActionForm action={deleteAccount} submitLabel="Delete my account and data" variant="destructive">
            <Field id="confirmDelete" label="Type DELETE to permanently remove your account and every record">
              <Input id="confirmDelete" name="confirm" autoComplete="off" />
            </Field>
          </ActionForm>
        </div>
      </Section>

    </div>
  );
}

function MoveButton({
  discipline,
  name,
  direction,
  disabled,
}: {
  discipline: string;
  name: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return (
    <form action={moveDiscipline}>
      <input type="hidden" name="discipline" value={discipline} />
      <input type="hidden" name="direction" value={direction} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        aria-label={`Move ${name} ${direction}`}
        title={`Move ${name} ${direction}`}
      >
        <Icon />
      </Button>
    </form>
  );
}

function Section({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card id={id} className={cn("scroll-mt-6", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  children,
  inline,
}: {
  id: string;
  label: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <FieldBox orientation={inline ? "horizontal" : "vertical"} className={inline ? "justify-between" : "gap-1.5"}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
    </FieldBox>
  );
}

/** One of the user's schools or disciplines: its name and spellings, editable in place. */
function CategoryRow({
  kind,
  entry,
  hasTargets,
  rank,
  first,
  last,
}: {
  kind: "university" | "discipline";
  entry: { id: string; name: string; aliases: string[] };
  hasTargets?: boolean;
  rank?: number;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <li className="rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          {rank ? `${rank}. ` : ""}
          <span className="font-medium">{entry.name}</span>
          {kind === "university" ? <span className="text-xs text-muted-foreground"> · {hasTargets ? "own targets" : "extra pool"}</span> : null}
          {entry.aliases.length ? <span className="block truncate text-xs text-muted-foreground">Also: {entry.aliases.join(", ")}</span> : null}
        </span>
        <span className="flex items-center gap-1">
          {kind === "discipline" ? (
            <>
              <MoveButton discipline={entry.id} name={entry.name} direction="up" disabled={Boolean(first)} />
              <MoveButton discipline={entry.id} name={entry.name} direction="down" disabled={Boolean(last)} />
            </>
          ) : null}
          <DeleteCategoryButton kind={kind} id={entry.id} name={entry.name} />
        </span>
      </div>
      <LazyEdit>
        <CategoryForm kind={kind} entry={entry} hasTargets={hasTargets} />
      </LazyEdit>
    </li>
  );
}

/** Adds a school or discipline, or edits one (with `entry`). */
function CategoryForm({ kind, entry, hasTargets = true }: { kind: "university" | "discipline"; entry?: { id: string; name: string; aliases: string[] }; hasTargets?: boolean }) {
  const prefix = `${kind}-${entry?.id ?? "new"}`;
  const noun = kind === "university" ? "school" : "discipline";
  return (
    <ActionForm action={saveCategory} submitLabel={entry ? "Save" : `Add ${noun}`} size="sm" variant={entry ? "default" : "outline"} resetOnSuccess={!entry}>
      <input type="hidden" name="kind" value={kind} />
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <Field id={`${prefix}-name`} label={entry ? "Name" : `New ${noun}`}>
        <Input id={`${prefix}-name`} name="name" maxLength={200} defaultValue={entry?.name ?? ""} required placeholder={kind === "university" ? "School name" : "Discipline name"} />
      </Field>
      <Field id={`${prefix}-aliases`} label="Other ways it's written (optional, comma-separated)">
        <Input id={`${prefix}-aliases`} name="aliases" maxLength={2000} defaultValue={entry?.aliases.join(", ") ?? ""} placeholder="Short forms, abbreviations, campuses" />
      </Field>
      {kind === "university" ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="hasTargets" defaultChecked={hasTargets} />
          Give this school its own targets
        </label>
      ) : null}
    </ActionForm>
  );
}
