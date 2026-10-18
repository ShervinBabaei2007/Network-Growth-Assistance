import { Suspense, type ReactNode } from "react";
import { Field as FieldBox, FieldLabel } from "@/components/ui/field";
import { Disclosure } from "@/components/disclosure";
import { Checkbox } from "@/components/ui/checkbox";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
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
import {
  confirmClassification,
  deleteCandidate,
  deleteInvitation,
  reclassifyCandidate,
  recordInvitationSent,
  resolveInvitation,
  setCandidateStatus,
  updateCandidate,
} from "../actions";

export const metadata = { title: "Candidate · Network Growth" };

export default function CandidatePage({ params }: PageProps<"/candidates/[id]">) {
  return (
    <div className="grid gap-6">
      <Link href="/candidates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Candidates
      </Link>
      <Suspense fallback={<PageSkeleton label="Loading…" />}>
        <CandidateDetail params={params} />
      </Suspense>
    </div>
  );
}

async function CandidateDetail({ params }: Pick<PageProps<"/candidates/[id]">, "params">) {
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

  const tz = settings?.timezone ?? "UTC";
  const today = localDate(new Date(), tz);
  const invitation = c.invitations[0] ?? null;
  const confirmed = c.university_confidence === "confirmed" && c.discipline_confidence === "confirmed";
  const suggestion = classifyCandidate(c.raw_school_text, c.raw_program_text, catalog);
  const hidden = <input type="hidden" name="id" value={c.id} />;

  return (
    <>
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
          Open on LinkedIn <ExternalLink aria-hidden />
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Next step">
          {c.status === "new" || c.status === "awaiting_review" ? (
            <div className="grid gap-3">
              {!confirmed ? (
                <p className="text-sm text-muted-foreground">
                  Confirm the school and program below before approving.
                </p>
              ) : null}
              <StatusButtons primary id={c.id} options={[["approved", "Approve for outreach"], ["not_a_match", "Not a match"], ["do_not_contact", "Do not contact"]]} />
            </div>
          ) : null}

          {c.status === "approved" ? (
            <div className="grid gap-4">
              <ActionForm action={recordInvitationSent} submitLabel="Record invitation sent">
                {hidden}
                <Field id="sentDate" label="Sent on">
                  <Input id="sentDate" name="date" type="date" max={today} defaultValue={today} required />
                </Field>
                <Field id="sentNote" label="Note you included (optional)">
                  <Textarea id="sentNote" name="note" rows={3} maxLength={1000} />
                </Field>
                <p className="text-xs text-muted-foreground">
                  Send the invitation on LinkedIn yourself first, then record it here.
                </p>
              </ActionForm>
              <StatusButtons id={c.id} options={[["awaiting_review", "Back to review"], ["not_a_match", "Not a match"], ["do_not_contact", "Do not contact"]]} />
            </div>
          ) : null}

          {c.status === "not_a_match" || (c.status === "do_not_contact" && !invitation) ? (
            <StatusButtons id={c.id} options={[["awaiting_review", "Move back to review"]]} />
          ) : null}

          {invitation ? (
            <div className="grid gap-4">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Fact label="Sent">{localDate(invitation.sent_at, tz)}</Fact>
                <Fact label="Outcome">
                  {invitation.outcome}
                  {invitation.resolved_at ? ` on ${localDate(invitation.resolved_at, tz)}` : ""}
                </Fact>
                <Fact label="Recorded from">{invitation.source === "linkedin_export" ? "LinkedIn export" : "This app"}</Fact>
                <Fact label="Note">{invitation.note_text ? "Included" : "None"}</Fact>
              </dl>
              {invitation.note_text ? (
                <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">{invitation.note_text}</blockquote>
              ) : null}
              {invitation.outcome === "pending" ? (
                <ActionForm action={resolveInvitation} submitLabel="Save outcome">
                  {hidden}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="outcome" label="Outcome">
                      <AppSelect id="outcome" name="outcome" defaultValue="accepted">
                        <option value="accepted">Accepted</option>
                        <option value="declined">Declined (if you know)</option>
                        <option value="withdrawn">Withdrawn by you</option>
                      </AppSelect>
                    </Field>
                    <Field id="outcomeDate" label="On">
                      <Input id="outcomeDate" name="date" type="date" max={today} defaultValue={today} required />
                    </Field>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only record acceptance once LinkedIn shows you&apos;re connected.
                  </p>
                </ActionForm>
              ) : null}
              <Disclosure variant="plain" summary="Recorded by mistake?">
                <ActionForm action={deleteInvitation} submitLabel="Remove invitation record" variant="outline" size="sm">
                  {hidden}
                  <label className="flex items-center gap-2">
                    <Checkbox name="confirm" /> Yes, no invitation was actually sent
                  </label>
                </ActionForm>
              </Disclosure>
            </div>
          ) : null}
        </Section>

        <Section title="School and discipline" description="Only confirmed values count toward targets. Choose from your own lists (Settings → Your networking plan).">
          <ActionForm action={confirmClassification} submitLabel="Confirm">
            {hidden}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="university" label="School">
                <AppSelect id="university" name="university" defaultValue={c.university ?? ""}>
                  <option value="">Unknown / not one of my schools</option>
                  {catalog.universities.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </AppSelect>
              </Field>
              <Field id="discipline" label="Discipline">
                <AppSelect id="discipline" name="discipline" defaultValue={c.discipline ?? ""}>
                  <option value="">Unknown / not one of my disciplines</option>
                  {catalog.disciplines.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </AppSelect>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Profile says: {c.raw_school_text || "no school"} · {c.raw_program_text || "no program"}.
              {!confirmed ? ` Automatic check: ${suggestion.university.reason} ${suggestion.discipline.reason}` : ""}
            </p>
          </ActionForm>
          <ActionForm action={reclassifyCandidate} submitLabel="Re-run automatic check" variant="outline" size="sm" className="pt-3">
            {hidden}
          </ActionForm>
        </Section>

        <Section title="Details">
          <ActionForm action={updateCandidate} submitLabel="Save details">
            {hidden}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="fullName" label="Name">
                <Input id="fullName" name="fullName" defaultValue={c.full_name} required maxLength={200} />
              </Field>
              <Field id="role" label="Role or headline">
                <Input id="role" name="role" defaultValue={c.role ?? ""} maxLength={300} />
              </Field>
              <Field id="schoolText" label="School (as shown)">
                <Input id="schoolText" name="schoolText" defaultValue={c.raw_school_text ?? ""} maxLength={300} />
              </Field>
              <Field id="programText" label="Program (as shown)">
                <Input id="programText" name="programText" defaultValue={c.raw_program_text ?? ""} maxLength={300} />
              </Field>
              <Field id="degreeLevel" label="Degree level">
                <AppSelect id="degreeLevel" name="degreeLevel" defaultValue={c.degree_level ?? ""}>
                  <option value="">Unknown</option>
                  {Object.entries(DEGREE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </AppSelect>
              </Field>
              <Field id="gradYear" label="Graduation year">
                <Input id="gradYear" name="gradYear" type="number" min={1950} max={2100} defaultValue={c.grad_year ?? ""} />
              </Field>
            </div>
            <Field id="notes" label="Networking notes">
              <Textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={c.notes ?? ""} />
            </Field>
            <p className="text-xs text-muted-foreground">
              Source: {c.source === "linkedin_export" ? "LinkedIn export" : c.source === "csv" ? "CSV import" : "added by hand"} · discovered{" "}
              {localDate(c.discovered_at, tz)}
            </p>
          </ActionForm>
        </Section>

        <Section title="Delete" description="Removes this person and any invitation history from your workspace.">
          {c.status !== "do_not_contact" ? (
            <div className="mb-4">
              <StatusButtons id={c.id} options={[["do_not_contact", "Mark do not contact instead"]]} />
            </div>
          ) : null}
          <ActionForm action={deleteCandidate} submitLabel="Delete permanently" variant="destructive">
            {hidden}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="confirm" /> I understand this can&apos;t be undone
            </label>
          </ActionForm>
        </Section>
      </div>
    </>
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
