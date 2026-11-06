import { type ReactNode } from "react";
import { Field as FieldBox, FieldLabel } from "@/components/ui/field";
import { Disclosure } from "@/components/disclosure";
import { Checkbox } from "@/components/ui/checkbox";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { CategoryLabel, StatusBadge } from "@/components/candidate-badges";
import { AppSelect } from "@/components/app-select";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { classifyCandidate } from "@/lib/classify";
import { localDate } from "@/lib/dates";
import { loadCatalog } from "@/lib/data/catalog";
import { DEGREE_LABELS } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { LocaleScope } from "@/components/locale-scope";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatters } from "@/lib/i18n";
import { confirmClassification, deleteCandidate, deleteInvitation, reclassifyCandidate, recordInvitationSent, resolveInvitation, setCandidateStatus, updateCandidate } from "../actions";

export async function CandidateRecord({ params }: Pick<PageProps<"/candidates/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: c }, { data: settings }, catalog] = await Promise.all([
    supabase
      .from("candidates")
      .select("*, invitations(sent_at, note_text, outcome, resolved_at, source)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("settings").select("timezone").single(),
    loadCatalog(supabase),
  ]);
  if (!c) notFound();

  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const tz = settings?.timezone ?? "UTC";
  const today = localDate(new Date(), tz);
  const invitation = c.invitations[0] ?? null;
  const confirmed = c.university_confidence === "confirmed" && c.discipline_confidence === "confirmed";
  const suggestion = classifyCandidate(c.raw_school_text, c.raw_program_text, catalog);
  const hidden = <input type="hidden" name="id" value={c.id} />;

  return (
    <LocaleScope groups={["ui"]}>
    <div className="@container grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">{c.full_name}</h1>
          <p className="text-sm text-muted-foreground">{c.role}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={c.status} />
            <CategoryLabel university={c.university} discipline={c.discipline} confirmed={confirmed} catalog={catalog} />
          </div>
        </div>
        <a
          href={c.profile_url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          {t("msg.openOnLinkedinbb3f")} <ExternalLink aria-hidden />
        </a>
      </div>

      <div className="grid gap-6 @3xl:grid-cols-2">
        <Section title={t("msg.nextStepc290")}>
          {c.status === "new" || c.status === "awaiting_review" ? (
            <div className="grid gap-3">
              {!confirmed ? (
                <p className="text-sm text-muted-foreground">
                  {t("msg.confirmTheSchoolAnd4c83")}
                </p>
              ) : null}
              <StatusButtons primary id={c.id} options={[["approved", t("msg.approveForOutreach75a9")], ["not_a_match", t("msg.notAMatch279a")], ["do_not_contact", t("msg.doNotContact9121")]]} />
            </div>
          ) : null}

          {c.status === "approved" ? (
            <div className="grid gap-4">
              <ActionForm action={recordInvitationSent} submitLabel={t("msg.recordInvitationSent2361")}>
                {hidden}
                <Field id="sentDate" label={t("msg.sentOnabce")}>
                  <Input id="sentDate" name="date" type="date" max={today} defaultValue={today} required />
                </Field>
                <Field id="sentNote" label={t("msg.noteYouIncludedOptional5cfb")}>
                  <Textarea id="sentNote" name="note" rows={3} maxLength={1000} />
                </Field>
                <p className="text-xs text-muted-foreground">
                  {t("msg.sendTheInvitationOn7ceb")}
                </p>
              </ActionForm>
              <StatusButtons id={c.id} options={[["awaiting_review", t("msg.backToReview77a6")], ["not_a_match", t("msg.notAMatch279a")], ["do_not_contact", t("msg.doNotContact9121")]]} />
            </div>
          ) : null}

          {c.status === "not_a_match" || (c.status === "do_not_contact" && !invitation) ? (
            <StatusButtons id={c.id} options={[["awaiting_review", t("msg.moveBackToReview3618")]]} />
          ) : null}

          {invitation ? (
            <div className="grid gap-4">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Fact label={t("msg.sent7f8c")}>{localDate(invitation.sent_at, tz)}</Fact>
                <Fact label={t("msg.outcomecf73")}>
                  {t(`candRecord.out${invitation.outcome.charAt(0).toUpperCase()}${invitation.outcome.slice(1)}` as "candRecord.outPending")}
                  {invitation.resolved_at ? t("candRecord.outcomeOn", { date: localDate(invitation.resolved_at, tz) }) : ""}
                </Fact>
                <Fact label={t("msg.recordedFrom4625")}>{invitation.source === "linkedin_export" ? t("msg.linkedinExportcfd5") : t("msg.thisApp95d5")}</Fact>
                <Fact label={t("msg.note3b06")}>{invitation.note_text ? t("msg.included984c") : t("msg.none6adf")}</Fact>
              </dl>
              {invitation.note_text ? (
                <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">{invitation.note_text}</blockquote>
              ) : null}
              {invitation.outcome === "pending" ? (
                <ActionForm action={resolveInvitation} submitLabel={t("msg.saveOutcome42f4")}>
                  {hidden}
                  <div className="grid gap-3 @@3xl:grid-cols-2">
                    <Field id="outcome" label={t("msg.outcomecf73")}>
                      <AppSelect id="outcome" name="outcome" defaultValue="accepted">
                        <option value="accepted">{t("msg.accepted382a")}</option>
                        <option value="declined">{t("msg.declinedIfYouKnow6bf5")}</option>
                        <option value="withdrawn">{t("msg.withdrawnByYou1578")}</option>
                      </AppSelect>
                    </Field>
                    <Field id="outcomeDate" label={t("msg.on521c")}>
                      <Input id="outcomeDate" name="date" type="date" max={today} defaultValue={today} required />
                    </Field>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("msg.onlyRecordAcceptanceOnce0a84")}
                  </p>
                </ActionForm>
              ) : null}
              <Disclosure variant="plain" summary={t("msg.recordedByMistake97eb")}>
                <ActionForm action={deleteInvitation} submitLabel={t("msg.removeInvitationRecord2918")} variant="outline" size="sm">
                  {hidden}
                  <label className="flex items-center gap-2">
                    <Checkbox name="confirm" /> {t("msg.yesNoInvitationWas069d")}
                  </label>
                </ActionForm>
              </Disclosure>
            </div>
          ) : null}
        </Section>

        <Section title={t("msg.schoolAndDisciplinef714")} description={t("msg.onlyConfirmedValuesCount0d94")}>
          <ActionForm action={confirmClassification} submitLabel={t("msg.confirm70d9")}>
            {hidden}
            <div className="grid gap-3 @@3xl:grid-cols-2">
              <Field id="university" label={t("msg.school955c")}>
                <AppSelect id="university" name="university" defaultValue={c.university ?? ""}>
                  <option value="">{t("msg.unknownNotOneOfa85d")}</option>
                  {catalog.universities.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </AppSelect>
              </Field>
              <Field id="discipline" label={t("msg.discipline1f12")}>
                <AppSelect id="discipline" name="discipline" defaultValue={c.discipline ?? ""}>
                  <option value="">{t("msg.unknownNotOneOf369b")}</option>
                  {catalog.disciplines.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </AppSelect>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("candRecord.profileSays", { school: c.raw_school_text || t("candRecord.noSchool"), program: c.raw_program_text || t("candRecord.noProgram") })}
              {!confirmed ? t("candRecord.autoCheck", { school: suggestion.university.reason, discipline: suggestion.discipline.reason }) : ""}
            </p>
          </ActionForm>
          <ActionForm action={reclassifyCandidate} submitLabel={t("msg.reRunAutomaticCheck18ba")} variant="outline" size="sm" className="pt-3">
            {hidden}
          </ActionForm>
        </Section>

        <Section title={t("msg.details3ec3")}>
          <ActionForm action={updateCandidate} submitLabel={t("msg.saveDetailscccd")}>
            {hidden}
            <div className="grid gap-3 @@3xl:grid-cols-2">
              <Field id="fullName" label={t("msg.name49ee")}>
                <Input id="fullName" name="fullName" defaultValue={c.full_name} required maxLength={200} />
              </Field>
              <Field id="role" label={t("msg.roleOrHeadlineda17")}>
                <Input id="role" name="role" defaultValue={c.role ?? ""} maxLength={300} />
              </Field>
              <Field id="schoolText" label={t("msg.schoolAsShownf867")}>
                <Input id="schoolText" name="schoolText" defaultValue={c.raw_school_text ?? ""} maxLength={300} />
              </Field>
              <Field id="programText" label={t("msg.programAsShown9d28")}>
                <Input id="programText" name="programText" defaultValue={c.raw_program_text ?? ""} maxLength={300} />
              </Field>
              <Field id="degreeLevel" label={t("msg.degreeLeveld676")}>
                <AppSelect id="degreeLevel" name="degreeLevel" defaultValue={c.degree_level ?? ""}>
                  <option value="">{t("msg.unknown8818")}</option>
                  {Object.keys(DEGREE_LABELS).map((v) => (
                    <option key={v} value={v}>
                      {t(`degree.${v}` as "degree.masters")}
                    </option>
                  ))}
                </AppSelect>
              </Field>
              <Field id="gradYear" label={t("msg.graduationYeare2d1")}>
                <Input id="gradYear" name="gradYear" type="number" min={1950} max={2100} defaultValue={c.grad_year ?? ""} />
              </Field>
            </div>
            <Field id="notes" label={t("msg.networkingNotesa4a7")}>
              <Textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={c.notes ?? ""} />
            </Field>
            <p className="text-xs text-muted-foreground">
              {t("candRecord.sourceLine", { source: c.source === "linkedin_export" ? t("candRecord.srcExport") : c.source === "csv" ? t("candRecord.srcCsv") : t("candRecord.srcHand"), date: formatters(locale).date(c.discovered_at, { dateStyle: "medium" }, tz) })}
            </p>
          </ActionForm>
        </Section>

        <Section title={t("msg.deletef2a6")} description={t("msg.removesThisPersonAndd97a")}>
          {c.status !== "do_not_contact" ? (
            <div className="mb-4">
              <StatusButtons id={c.id} options={[["do_not_contact", t("msg.markDoNotContacte67f")]]} />
            </div>
          ) : null}
          <ActionForm action={deleteCandidate} submitLabel={t("msg.deletePermanently8fb4")} variant="destructive">
            {hidden}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="confirm" /> {t("msg.iUnderstandThisCan1b9f")}
            </label>
          </ActionForm>
        </Section>
      </div>
    </div>
    </LocaleScope>
  );
}

function StatusButtons({ id, options, primary }: { id: string; options: [string, string][]; primary?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([status, label], i) => (
        <ActionForm key={status} action={setCandidateStatus} submitLabel={label} variant={primary && i === 0 ? "default" : "outline"} size="sm">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={status} />
        </ActionForm>
      ))}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** A labelled form control, on the shadcn Field. */
function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <FieldBox className="gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
    </FieldBox>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
