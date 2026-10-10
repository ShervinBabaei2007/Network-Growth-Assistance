import { Suspense, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  moveDiscipline,
  pauseOutreach,
  resumeOutreach,
  runDailyJobNow,
  updateGoal,
  updatePlanning,
  updateTargets,
} from "@/app/(app)/actions";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DISCIPLINE_LABELS } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings · Network Growth" };

const TIME_ZONES = [
  "America/Vancouver",
  "America/Edmonton",
  "America/Regina",
  "America/Winnipeg",
  "America/Toronto",
  "America/Halifax",
  "America/St_Johns",
];

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  const supabase = await createClient();
  const [{ data: s, error }, { data: targets }, { data: runs }] = await Promise.all([
    supabase.from("settings").select("*").single(),
    supabase.from("targets").select("discipline, university, target_count"),
    supabase.from("job_runs").select("run_date, status, stats, error, finished_at").order("run_date", { ascending: false }).limit(7),
  ]);
  if (error || !s) return <LoadError what="your settings" />;

  const targetValue = (d: string, u: string | null) =>
    targets?.find((t) => t.discipline === d && t.university === u)?.target_count ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
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

      <Section title="Goal" description="Growth is measured from the starting count to the overall target.">
        <ActionForm action={updateGoal} submitLabel="Save goal">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="overallTarget" label="Overall target">
              <Input id="overallTarget" name="overallTarget" type="number" min={1} max={30000} defaultValue={s.overall_target} required />
            </Field>
            <Field id="baselineSetting" label="Starting count">
              <Input id="baselineSetting" name="baseline" type="number" min={0} max={30000} defaultValue={s.baseline_connections ?? ""} />
            </Field>
            <Field id="startDateSetting" label="Start date">
              <Input id="startDateSetting" name="startDate" type="date" defaultValue={s.project_start_date} required />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Only acceptances on or after the start date count toward discipline targets.
          </p>
        </ActionForm>
      </Section>

      <Section title="Discipline priority" description="Attention moves down this list as each target is met.">
        <ol className="grid gap-2">
          {s.discipline_priority.map((d, i) => (
            <li key={d} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span>
                {i + 1}. {DISCIPLINE_LABELS[d]}
              </span>
              <span className="flex gap-1">
                <MoveButton discipline={d} direction="up" disabled={i === 0} />
                <MoveButton discipline={d} direction="down" disabled={i === s.discipline_priority.length - 1} />
              </span>
            </li>
          ))}
        </ol>
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
              <Input id="timezone" name="timezone" list="time-zones" defaultValue={s.timezone} required />
              <datalist id="time-zones">
                {TIME_ZONES.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="countUbcoAsUbc" defaultChecked={s.count_ubco_as_ubc} className="size-4 accent-primary" />
            Count UBC Okanagan as UBC
          </label>
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
        title="Targets"
        description="New accepted connections per discipline, and the U of T and UBC share of each. SFU and Waterloo have no separate targets."
        className="lg:col-span-2"
      >
        <ActionForm action={updateTargets} submitLabel="Save targets">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {s.discipline_priority.map((d) => (
              <fieldset key={d} className="grid gap-2 rounded-md border p-3">
                <legend className="px-1 text-sm font-medium">{DISCIPLINE_LABELS[d]}</legend>
                {([
                  ["total", null, "Total"],
                  ["uoft", "uoft", "U of T"],
                  ["ubc", "ubc", "UBC"],
                ] as const).map(([key, u, label]) => (
                  <Field key={key} id={`${d}.${key}`} label={label} inline>
                    <Input id={`${d}.${key}`} name={`${d}.${key}`} type="number" min={0} max={30000} defaultValue={targetValue(d, u)} required className="w-24" />
                  </Field>
                ))}
              </fieldset>
            ))}
          </div>
        </ActionForm>
      </Section>
    </div>
  );
}

function MoveButton({
  discipline,
  direction,
  disabled,
}: {
  discipline: string;
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
        aria-label={`Move ${DISCIPLINE_LABELS[discipline as keyof typeof DISCIPLINE_LABELS]} ${direction}`}
      >
        <Icon />
      </Button>
    </form>
  );
}

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
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
    <div className={inline ? "flex items-center justify-between gap-2" : "grid gap-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
