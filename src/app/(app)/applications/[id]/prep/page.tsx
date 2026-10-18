import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadError } from "@/components/load-error";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/applications/format";
import { STAGE_LABEL } from "@/lib/applications/stages";
import { buildPrepPack, type PrepBullet, type QuestionPrep } from "@/lib/interview-prep/prep";
import { loadActiveResume } from "@/lib/job-postings/service";
import { createClient } from "@/lib/supabase/server";
import { PrepExport } from "./export-buttons";

export const metadata = { title: "Interview prep · Network Growth" };

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export default function PrepPage({ params }: PageProps<"/applications/[id]/prep">) {
  return (
    <Suspense fallback={<PageSkeleton label="Building your prep pack…" />}>
      <Prep params={params} />
    </Suspense>
  );
}

async function Prep({ params }: Pick<PageProps<"/applications/[id]/prep">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: app, error } = await supabase.from("applications").select("id, title, company, stage, job_id, apply_url").eq("id", id).maybeSingle();
  if (error) return <LoadError what="this application" />;
  if (!app) notFound();

  const [{ data: settings }, interviews, requirements, resume, saved] = await Promise.all([
    supabase.from("settings").select("timezone").single(),
    supabase.from("application_interviews").select("starts_at, timezone, kind, location, duration_minutes").eq("application_id", id).order("starts_at"),
    app.job_id ? supabase.from("job_requirements").select("text, kind, category, idx").eq("job_id", app.job_id).order("idx") : Promise.resolve({ data: [] as { text: string; kind: string; category: string; idx: number }[] }),
    loadActiveResume(supabase),
    supabase.from("interview_preps").select("id, created_at").eq("application_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  const tz = settings?.timezone ?? "UTC";

  // The user's own accomplishment lines, with where each came from. Skills and the summary are not stories.
  const bullets: PrepBullet[] = [];
  if (resume) {
    for (const entry of [...resume.profile.experience, ...resume.profile.projects, ...resume.profile.activities, ...resume.profile.awards]) {
      const source = [entry.title, entry.organization].filter(Boolean).join(", ");
      for (const b of entry.bullets) bullets.push({ id: b.id, text: b.text, source });
    }
  }

  const pack = buildPrepPack({
    title: app.title,
    company: app.company,
    stage: app.stage,
    postingUrl: app.apply_url,
    requirements: (requirements.data ?? []).map((r) => ({ text: r.text, kind: r.kind === "must" ? "must" : "nice", category: r.category })),
    bullets,
    interviews: (interviews.data ?? []).map((i) => ({ startsAt: i.starts_at, timezone: i.timezone, kind: i.kind, location: i.location, durationMinutes: i.duration_minutes })),
  });
  const fileName = `interview-prep-${(app.company ?? app.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;

  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: `/applications/${app.id}`, label: app.title }}
        title="Interview prep"
        description={`${app.title}${app.company ? ` at ${app.company}` : ""}. Built from your saved posting and your own resume. Nothing is invented.`}
        meta={<Badge variant="secondary">{STAGE_LABEL[app.stage]}</Badge>}
        actions={<PrepExport applicationId={app.id} pack={pack} fileName={fileName} />}
      />

      {!app.job_id ? (
        <p role="status" className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          This application isn&apos;t linked to a saved posting, so there are no likely topics. The questions below still apply.
        </p>
      ) : null}
      {!resume ? (
        <p role="status" className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          You haven&apos;t added a resume, so there are no stories matched to the questions yet.{" "}
          <Link href="/jobs/resume" className="underline underline-offset-4">Add your resume</Link>.
        </p>
      ) : null}

      <Section title="Likely topics" hint="The posting's own requirements, required ones first.">
        {pack.topics.length ? (
          pack.topics.map((t) => (
            <div key={t.category} className="grid gap-1">
              <h3 className="text-sm font-medium">{t.category}</h3>
              <ul className="list-disc pl-5 text-sm">
                {t.items.map((i) => (
                  <li key={i.text}>
                    {i.text} {i.kind === "must" ? <span className="text-muted-foreground">(required)</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No requirements were read from a posting.</p>
        )}
      </Section>

      <Section title="Questions they are likely to ask" hint="Your own resume lines that fit each one. Check they are accurate and add the details only you know.">
        {pack.behavioural.map((q) => (
          <Question key={q.question} q={q} />
        ))}
      </Section>

      {pack.technical.length ? (
        <Section title="About the role's requirements" hint="One question for each thing the posting requires.">
          {pack.technical.map((q) => (
            <Question key={q.question} q={q} />
          ))}
        </Section>
      ) : null}

      <Section title="Questions to ask them">
        <ul className="list-disc pl-5 text-sm">
          {pack.askThem.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </Section>

      <Section title="Checklist for the day">
        <ul className="grid gap-1.5 text-sm">
          {pack.checklist.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <span aria-hidden className="mt-1 size-3.5 shrink-0 rounded-[3px] border" />
              {c}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Sources and notes">
        <ul className="grid gap-1 text-sm">
          {pack.sources.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                {s.label}
              </a>
            </li>
          ))}
          {pack.notes.map((n) => (
            <li key={n} className="text-muted-foreground">
              {n}
            </li>
          ))}
        </ul>
      </Section>

      {saved.data?.length ? (
        <Section title="Saved copies">
          <ul className="text-sm text-muted-foreground">
            {saved.data.map((s) => (
              <li key={s.id}>Saved {formatDateTime(s.created_at, tz)}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hint ? <CardDescription>{hint}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function Question({ q }: { q: QuestionPrep }) {
  return (
    <div className="grid gap-1.5" data-testid="prep-question">
      <h3 className="font-medium">{q.question}</h3>
      <p className="text-xs text-muted-foreground">{q.why}</p>
      {q.stories.length ? (
        <ul className="grid gap-1.5 text-sm">
          {q.stories.map((s) => (
            <li key={s.bullet.id} className="rounded-md border bg-muted/30 p-2">
              <span data-testid="prep-story">{s.bullet.text}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">From your resume{s.bullet.source ? `: ${s.bullet.source}` : ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{q.empty}</p>
      )}
    </div>
  );
}
