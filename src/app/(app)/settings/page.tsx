import { Tx } from "@/components/tx";
import { LocaleScope } from "@/components/locale-scope";
import { formatters, type Translator } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
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
import { LanguageSwitchServer } from "@/components/language-switch-server";
import { LazyAppearanceForm } from "./appearance-lazy";
import { DeleteCategoryButton } from "./category-delete";
import { LazyEdit } from "./lazy-edit";
import { TimeZoneInput } from "./timezone-input";

export const metadata = { title: "Settings · Network Growth" };

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold"><Tx k="pages.settings.title" /></h1>
      {/* One boundary for the whole page, so the AI-key card can't appear under the skeleton and then be pushed down. */}
      <Suspense fallback={<PageSkeleton labelKey="loading.generic" />}>
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
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  const targetValue = (d: string, u: string | null) =>
    targets?.find((row) => row.discipline === d && row.university === u)?.target_count ?? null;

  return (
    <LocaleScope groups={["ui", "appearance"]}>
    <div className="grid gap-6 lg:grid-cols-2">
      <Section
        id="plan"
        title={t("settingsPage.planTitle")}
        description={t("settingsPage.planDesc")}
        className="lg:col-span-2"
      >
        <div className="grid gap-6">
          <ActionForm action={updateGoal} protect submitLabel={t("settingsPage.saveGoal")}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="overallTarget" label={t("settingsPage.goalTotal")}>
                <Input id="overallTarget" name="overallTarget" type="number" min={1} max={30000} defaultValue={s.overall_target ?? ""} placeholder={t("settingsPage.notSet")} />
              </Field>
              <Field id="baselineSetting" label={t("settingsPage.startingCount")}>
                <Input id="baselineSetting" name="baseline" type="number" min={0} max={30000} defaultValue={s.baseline_connections ?? ""} />
              </Field>
              <Field id="startDateSetting" label={t("settingsPage.startDate")}>
                <Input id="startDateSetting" name="startDate" type="date" defaultValue={s.project_start_date} required />
              </Field>
            </div>
          </ActionForm>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid content-start gap-3">
              <h2 className="text-sm font-semibold">{t("settingsPage.schools")}</h2>
              <p className="text-xs text-muted-foreground">{t("settingsPage.schoolsHelp")}</p>
              {catalog.universities.length ? (
                <ul className="grid gap-2">
                  {catalog.universities.map((u) => (
                    <CategoryRow key={u.id} t={t} kind="university" entry={u} hasTargets={u.hasTargets} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("settingsPage.noSchools")}</p>
              )}
              <CategoryForm t={t} kind="university" />
            </div>
            <div className="grid content-start gap-3">
              <h2 className="text-sm font-semibold">{t("settingsPage.disciplines")}</h2>
              <p className="text-xs text-muted-foreground">{t("settingsPage.disciplinesHelp")}</p>
              {catalog.disciplines.length ? (
                <ol className="grid gap-2">
                  {catalog.disciplines.map((d, i) => (
                    <CategoryRow key={d.id} t={t} kind="discipline" entry={d} rank={i + 1} first={i === 0} last={i === catalog.disciplines.length - 1} />
                  ))}
                </ol>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("settingsPage.noDisciplines")}</p>
              )}
              <CategoryForm t={t} kind="discipline" />
            </div>
          </div>

          <div className="grid gap-3">
            <h2 className="text-sm font-semibold">{t("settingsPage.targets")}</h2>
            {catalog.disciplines.length ? (
              <ActionForm action={updateTargets} protect submitLabel={t("settingsPage.saveTargets")}>
                <p className="text-xs text-muted-foreground">{t("settingsPage.targetsHelp")}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {catalog.disciplines.map((d) => (
                    <fieldset key={d.id} className="grid gap-2 rounded-md border p-3">
                      <legend className="px-1 text-sm font-medium">{d.name}</legend>
                      {[{ key: "total", id: null as string | null, label: t("settingsPage.total") }, ...targetUniversities(catalog).map((u) => ({ key: u.id, id: u.id as string | null, label: u.name }))].map((tg) => (
                        <Field key={tg.key} id={`${d.id}.${tg.key}`} label={tg.label} inline>
                          <Input id={`${d.id}.${tg.key}`} name={`${d.id}.${tg.key}`} type="number" min={0} max={30000} defaultValue={targetValue(d.id, tg.id) ?? ""} placeholder="—" className="w-24" />
                        </Field>
                      ))}
                    </fieldset>
                  ))}
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted-foreground">{t("settingsPage.targetsNeedDiscipline")}</p>
            )}
          </div>
        </div>
      </Section>
      <Section title={t("settingsPage.helpTitle")} description={t("settingsPage.helpDesc")}>
        <Link href="/help" className={buttonVariants({ variant: "outline" })}>
          {t("settingsPage.openHelp")}
        </Link>
      </Section>
      <Section id="language" title={t("settingsPage.languageTitle")} description={t("settingsPage.languageDesc")}>
        <Suspense fallback={null}>
          <LanguageSwitchServer />
        </Suspense>
      </Section>

      <Section title={t("settingsPage.appearanceTitle")} description={t("settingsPage.appearanceDesc")}>
        <LazyAppearanceForm initial={normalizeAppearance({ theme: s.theme, density: s.density, text: s.text_size, accent: s.accent, contrast: s.contrast })} />
      </Section>
      <Section title={t("settingsPage.applicationsTitle")} description={t("settingsPage.applicationsDesc")}>
        <ActionForm action={updateTrackerSettings} protect submitLabel={t("settingsPage.save")}>
          <Field id="noResponseDays" label={t("settingsPage.noResponseAfter")}>
            <Input id="noResponseDays" name="noResponseDays" type="number" min={1} max={365} defaultValue={s.no_response_days} required className="w-28" />
          </Field>
        </ActionForm>
      </Section>
      <Section id="notifications" title={t("settingsPage.notificationsTitle")} description={t("settingsPage.notificationsDesc")}>
        <ActionForm action={updateNotificationSettings} protect submitLabel={t("settingsPage.save")}>
          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox name="notifyReminders" defaultChecked={s.notify_reminders} /> {t("settingsPage.notifyReminders")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox name="notifyInterviews" defaultChecked={s.notify_interviews} /> {t("settingsPage.notifyInterviews")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox name="weeklySummary" defaultChecked={s.weekly_summary} /> {t("settingsPage.weeklySummary")}
            </label>
            {emailConfigured() ? (
              <label className="flex items-center gap-2">
                <Checkbox name="emailNotifications" defaultChecked={s.email_notifications} /> {t("settingsPage.allowEmail")}
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">{t("settingsPage.emailNotSetUp")}</p>
            )}
            <p className="text-xs text-muted-foreground">{t("settingsPage.emailNote")}</p>
          </div>
        </ActionForm>
      </Section>
      <Section title={t("settingsPage.pauseTitle")} description={t("settingsPage.pauseDesc")}>
        {s.paused ? (
          <div className="grid gap-3">
            <p className="text-sm">
              {t("settingsPage.pausedSince", { date: s.paused_at ? formatters(locale).date(s.paused_at, { dateStyle: "medium", timeStyle: "short" }) : "—" })}
              {s.pause_reason ? t("settingsPage.pausedReason", { reason: s.pause_reason }) : ""}
            </p>
            <ActionForm action={resumeOutreach} submitLabel={t("settingsPage.resume")} variant="outline" />
          </div>
        ) : (
          <ActionForm action={pauseOutreach} submitLabel={t("settingsPage.pause")} variant="destructive">
            <Field id="reason" label={t("settingsPage.pauseReasonLabel")}>
              <Textarea id="reason" name="reason" maxLength={500} rows={2} />
            </Field>
          </ActionForm>
        )}
      </Section>

      <Section
        title={t("settingsPage.planningTitle")}
        description={t("settingsPage.planningDesc")}
      >
        <ActionForm action={updatePlanning} protect submitLabel={t("settingsPage.savePlanning")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="dailyInviteTarget" label={t("settingsPage.dailyInvites")}>
              <Input id="dailyInviteTarget" name="dailyInviteTarget" type="number" min={0} max={1000} defaultValue={s.daily_invite_target ?? ""} placeholder={t("settingsPage.notSet")} />
            </Field>
            <Field id="weeklyInviteCap" label={t("settingsPage.weeklyCap")}>
              <Input id="weeklyInviteCap" name="weeklyInviteCap" type="number" min={0} max={5000} defaultValue={s.weekly_invite_cap ?? ""} placeholder={t("settingsPage.none")} />
            </Field>
            <Field id="monthlyNoteAllowance" label={t("settingsPage.monthlyNotes")}>
              <Input id="monthlyNoteAllowance" name="monthlyNoteAllowance" type="number" min={0} max={1000} defaultValue={s.monthly_note_allowance ?? ""} placeholder={t("settingsPage.unknown")} />
            </Field>
            <Field id="noteCharLimit" label={t("settingsPage.noteLimit")}>
              <Input id="noteCharLimit" name="noteCharLimit" type="number" min={1} max={1000} defaultValue={s.note_char_limit} required />
            </Field>
            <Field id="stalePendingDays" label={t("settingsPage.staleAfter")}>
              <Input id="stalePendingDays" name="stalePendingDays" type="number" min={1} max={365} defaultValue={s.stale_pending_days} required />
            </Field>
            <Field id="timezone" label={t("settingsPage.timeZone")}>
              <TimeZoneInput id="timezone" defaultValue={s.timezone} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="autoApprove" defaultChecked={s.auto_approve} className="mt-0.5" />
            <span>
              {t("settingsPage.autoApprove")}
              <span className="block text-xs text-muted-foreground">{t("settingsPage.autoApproveNote")}</span>
            </span>
          </label>
        </ActionForm>
      </Section>

      <Section
        title={t("settingsPage.aboutTitle")}
        description={t("settingsPage.aboutDesc")}
      >
        <ActionForm action={updateNoteProfile} protect submitLabel={t("settingsPage.save")}>
          <Field id="mySchool" label={t("settingsPage.yourSchool")}>
            <Input id="mySchool" name="mySchool" maxLength={200} defaultValue={s.my_school_text ?? ""} placeholder={t("settingsPage.yourSchoolPlaceholder")} />
          </Field>
          <Field id="myProgram" label={t("settingsPage.yourProgram")}>
            <Input id="myProgram" name="myProgram" maxLength={200} defaultValue={s.my_program_text ?? ""} placeholder={t("settingsPage.yourProgramPlaceholder")} />
          </Field>
          <Field id="myInterests" label={t("settingsPage.interests")}>
            <Input id="myInterests" name="myInterests" maxLength={300} defaultValue={s.my_interests ?? ""} placeholder={t("settingsPage.interestsPlaceholder")} />
          </Field>
        </ActionForm>
      </Section>

      <Section
        title={t("settingsPage.dailyJobTitle")}
        description={t("settingsPage.dailyJobDesc")}
      >
        <div className="grid gap-3 text-sm">
          {runs && runs.length > 0 ? (
            <ul className="grid gap-1">
              {runs.map((r) => {
                const st = r.stats as { queued?: number; reclassified?: number } | null;
                return (
                  <li key={r.run_date}>
                    <span className="font-medium">{r.run_date}</span> · {r.status}
                    {r.status === "succeeded" && st ? t("settingsPage.runSummary", { queued: st.queued ?? 0, classified: st.reclassified ?? 0 }) : ""}
                    {r.status === "failed" && r.error ? ` · ${r.error}` : ""}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t("settingsPage.noRuns")}</p>
          )}
          <ActionForm action={runDailyJobNow} submitLabel={t("settingsPage.runNow")} variant="outline" size="sm" />
        </div>
      </Section>

      <Section
        title={t("settingsPage.dataTitle")}
        description={t("settingsPage.dataDesc")}
      >
        <div className="grid gap-4 text-sm">
          <a href="/api/export" className="underline underline-offset-4" download>
            {t("settingsPage.download")}
          </a>
          <ActionForm action={deleteAccount} submitLabel={t("settingsPage.deleteAccount")} variant="destructive">
            <Field id="confirmDelete" label={t("settingsPage.typeDeleteAccount")}>
              <Input id="confirmDelete" name="confirm" autoComplete="off" />
            </Field>
          </ActionForm>
        </div>
      </Section>

    </div>
    </LocaleScope>
  );
}

function MoveButton({
  t,
  discipline,
  name,
  direction,
  disabled,
}: {
  t: Translator;
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
        aria-label={direction === "up" ? t("settingsPage.moveUp", { name }) : t("settingsPage.moveDown", { name })}
        title={direction === "up" ? t("settingsPage.moveUp", { name }) : t("settingsPage.moveDown", { name })}
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
    // Every section after the first is skipped by layout and paint until it nears the screen (the page is ~6,800px tall).
    // Links to a section's id, find-in-page and focus still work: `auto` renders it when it is needed.
    <Card id={id} className={cn("scroll-mt-6", id !== "plan" && "[contain-intrinsic-size:auto_22rem] [content-visibility:auto]", className)}>
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
  t,
  kind,
  entry,
  hasTargets,
  rank,
  first,
  last,
}: {
  t: Translator;
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
          {kind === "university" ? <span className="text-xs text-muted-foreground"> · {hasTargets ? t("settingsPage.ownTargets") : t("settingsPage.extraPool")}</span> : null}
          {entry.aliases.length ? <span className="block truncate text-xs text-muted-foreground">{t("settingsPage.also", { aliases: entry.aliases.join(", ") })}</span> : null}
        </span>
        <span className="flex items-center gap-1">
          {kind === "discipline" ? (
            <>
              <MoveButton t={t} discipline={entry.id} name={entry.name} direction="up" disabled={Boolean(first)} />
              <MoveButton t={t} discipline={entry.id} name={entry.name} direction="down" disabled={Boolean(last)} />
            </>
          ) : null}
          <DeleteCategoryButton kind={kind} id={entry.id} name={entry.name} />
        </span>
      </div>
      <LazyEdit>
        <CategoryForm t={t} kind={kind} entry={entry} hasTargets={hasTargets} />
      </LazyEdit>
    </li>
  );
}

/** Adds a school or discipline, or edits one (with `entry`). */
function CategoryForm({ t, kind, entry, hasTargets = true }: { t: Translator; kind: "university" | "discipline"; entry?: { id: string; name: string; aliases: string[] }; hasTargets?: boolean }) {
  const prefix = `${kind}-${entry?.id ?? "new"}`;
  return (
    <ActionForm action={saveCategory} submitLabel={entry ? t("settingsPage.save") : kind === "university" ? t("settingsPage.addSchool") : t("settingsPage.addDiscipline")} size="sm" variant={entry ? "default" : "outline"} resetOnSuccess={!entry}>
      <input type="hidden" name="kind" value={kind} />
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <Field id={`${prefix}-name`} label={entry ? t("settingsPage.name") : kind === "university" ? t("settingsPage.newSchool") : t("settingsPage.newDiscipline")}>
        <Input id={`${prefix}-name`} name="name" maxLength={200} defaultValue={entry?.name ?? ""} required placeholder={kind === "university" ? t("settingsPage.schoolName") : t("settingsPage.disciplineName")} />
      </Field>
      <Field id={`${prefix}-aliases`} label={t("settingsPage.aliases")}>
        <Input id={`${prefix}-aliases`} name="aliases" maxLength={2000} defaultValue={entry?.aliases.join(", ") ?? ""} placeholder={t("settingsPage.aliasesPlaceholder")} />
      </Field>
      {kind === "university" ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="hasTargets" defaultChecked={hasTargets} />
          {t("settingsPage.ownTargetsCheck")}
        </label>
      ) : null}
    </ActionForm>
  );
}
