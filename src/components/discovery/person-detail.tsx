"use client";

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "@/components/toast/notify";
import { useActionRunner } from "@/components/toast/use-action-runner";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  generateIntro,
  givePersonFeedback,
  logPersonInteraction,
  recordPersonEvent,
  resolveKnownMatch,
  saveLinkedInUrl,
  sendToCandidates,
  setPersonStatus,
  setProximity,
  undoPersonFeedback,
  updatePersonCrm,
  type ActionResult,
} from "@/app/(app)/people/actions";
import { ActionForm } from "@/components/action-form";
import { AppSelect } from "@/components/app-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CRM_STATUS_LABELS, FEEDBACK_LABELS, FIELD_LABELS, INTERACTION_LABELS, PROXIMITY_LABELS, TIER_LABELS } from "@/lib/discovery/labels";
import { INTRO_LIMIT } from "@/lib/discovery/labels";
import type { EvidenceItem, PersonDetail } from "@/lib/discovery/results";
import { ExternalLinks } from "./card-actions";

const CONFIDENCE_VARIANT = { high: "default", medium: "secondary", low: "outline" } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-t pt-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** The full research record for one person, with every action the user can take. */
export function PersonDetailView({ detail, searchId, onChange }: { detail: PersonDetail; searchId?: string; onChange: () => void }) {
  const p = detail.person;
  const runner = useActionRunner();
  const { pending, last: message } = runner;
  const run = (fn: () => Promise<ActionResult>) => runner.run(fn, { onSuccess: onChange });

  const search = detail.searches.find((s) => s.searchId === searchId) ?? detail.searches[0] ?? null;
  const bySource = useMemo(() => {
    const groups = new Map<string, EvidenceItem[]>();
    for (const f of detail.evidence) groups.set(f.sourceUrl, [...(groups.get(f.sourceUrl) ?? []), f]);
    return [...groups.entries()];
  }, [detail.evidence]);
  const fieldValues = (field: string) => [...new Set(detail.evidence.filter((f) => f.field === field).map((f) => f.value))];
  const manual = p.proximity === "manual_second" || p.proximity === "manual_third";

  return (
    <div className="grid gap-4 text-sm">
      {/* Profile */}
      <div className="grid gap-1">
        {p.current_title || p.current_company ? <p className="font-medium">{[p.current_title, p.current_company].filter(Boolean).join(" @ ")}</p> : null}
        {p.headline ? <p className="text-muted-foreground">{p.headline}</p> : null}
        {p.location ? <p className="text-muted-foreground">{p.location}</p> : null}
        <div className="flex flex-wrap items-center gap-1">
          <ExternalLinks person={{ personId: p.id, fullName: p.full_name, personalWebsite: p.personal_website, githubUrl: p.github_url, linkedinUrl: p.linkedin_url, linkedinSearchUrl: detail.linkedinSearchUrl }} />
        </div>
        {!p.linkedin_url ? (
          <ActionForm action={async (state, formData) => { const r = await saveLinkedInUrl(state, formData); if (r.status === "saved") onChange(); return r; }} submitLabel="Save link" size="sm" variant="outline" className="mt-2">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid gap-1.5">
              <Label htmlFor={`quick-li-${p.id}`}>Found them on LinkedIn? Paste their profile link</Label>
              <Input id={`quick-li-${p.id}`} name="linkedinUrl" placeholder="linkedin.com/in/…" required />
            </div>
          </ActionForm>
        ) : null}
      </div>

      {message ? (
        <p className={message.ok ? "text-muted-foreground" : "text-destructive"}>
          {message.text}
        </p>
      ) : null}

      {/* Status */}
      <Section title="Networking status">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`status-${p.id}`}>Status</Label>
            <AppSelect id={`status-${p.id}`} value={p.crm_status} disabled={pending} onChange={(e) => run(() => setPersonStatus(p.id, e.target.value))} className="w-56">
              {Object.entries(CRM_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </AppSelect>
          </div>
          {p.crm_status !== "connection_sent_manually" && p.crm_status !== "connected" && p.crm_status !== "replied" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setPersonStatus(p.id, "connection_sent_manually"))}>
              I sent a connection request
            </Button>
          ) : null}
        </div>
        {p.candidate_id ? (
          <p className="text-muted-foreground">
            In your{" "}
            <Link href={`/candidates/${p.candidate_id}`} className="underline underline-offset-4">
              Candidates list
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={pending || !p.linkedin_url} onClick={() => run(() => sendToCandidates(p.id))}>
              Add to Candidates &amp; Daily Queue
            </Button>
            {!p.linkedin_url ? <span className="text-xs text-muted-foreground">Needs their LinkedIn link (add it under Notes below).</span> : null}
          </div>
        )}
      </Section>

      {/* Connection */}
      <Section title="Connection">
        <p>{PROXIMITY_LABELS[p.proximity]}</p>
        {p.known_match_state === "needs_review" ? (
          <div className="grid gap-2 rounded-md bg-muted p-3">
            <p>
              Possibly {p.known_connections?.full_name ?? "one of your connections"}
              {p.known_connections?.company ? ` (${p.known_connections.company})` : ""}
              {p.known_match_confidence !== null ? `, ${Math.round(p.known_match_confidence * 100)}% likely` : ""}. Same person?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resolveKnownMatch(p.id, true))}>
                Yes, already connected
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resolveKnownMatch(p.id, false))}>
                No, different person
              </Button>
            </div>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          The app can&apos;t see LinkedIn degrees. If you checked their profile yourself, you can note what LinkedIn showed:
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={p.proximity === "manual_second" ? "default" : "outline"} disabled={pending} onClick={() => run(() => setProximity(p.id, "manual_second"))}>
            2nd degree
          </Button>
          <Button size="sm" variant={p.proximity === "manual_third" ? "default" : "outline"} disabled={pending} onClick={() => run(() => setProximity(p.id, "manual_third"))}>
            3rd degree
          </Button>
          {manual ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setProximity(p.id, "unknown"))}>
              Clear
            </Button>
          ) : null}
        </div>
      </Section>

      {/* Scoring */}
      {search ? (
        <Section title={`Why they match · ${search.relevance ?? 0} / 100`}>
          <p className="text-muted-foreground">
            {TIER_LABELS[search.tier]}
            {search.tierReason ? `: ${search.tierReason}` : ""}
          </p>
          <table className="w-full text-left">
            <caption className="sr-only">Score breakdown</caption>
            <tbody>
              {search.breakdown.map((l) => (
                <tr key={l.key} className="border-b last:border-0">
                  <th scope="row" className="py-1 pr-2 font-medium">
                    {l.label}
                  </th>
                  <td className="py-1 pr-2 text-muted-foreground">{l.detail}</td>
                  <td className="py-1 text-right tabular-nums">
                    +{l.points}
                    <span className="text-muted-foreground">/{l.max}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {p.reason_for_connecting ? (
        <Section title="Why connect">
          <p>{p.reason_for_connecting}</p>
          {p.conversation_angle ? <p className="text-muted-foreground">Conversation idea: {p.conversation_angle}</p> : null}
          <p className="text-xs text-muted-foreground">Written by AI from the evidence below only.</p>
        </Section>
      ) : null}

      <Section title="Education and career">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {["institution", "program", "degree", "grad_year", "role", "company", "location"].map((f) => {
            const values = fieldValues(f);
            return (
              <div key={f} className="contents">
                <dt className="text-muted-foreground">{FIELD_LABELS[f]}</dt>
                <dd>{values.length ? values.join("; ") : <span className="text-muted-foreground">? Unknown</span>}</dd>
              </div>
            );
          })}
        </dl>
      </Section>

      {/* Evidence */}
      <Section title={`Evidence · ${bySource.length} source${bySource.length === 1 ? "" : "s"}`}>
        <ul className="grid gap-3">
          {bySource.map(([url, facts]) => (
            <li key={url} className="grid gap-2 rounded-md border p-3">
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
                {facts[0].sourceTitle || url} <ExternalLink className="size-3.5" aria-hidden />
              </a>
              <ul className="grid gap-2">
                {facts.map((f) => (
                  <li key={f.id} className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {FIELD_LABELS[f.field]}: {f.value}
                      </span>
                      <Badge variant={CONFIDENCE_VARIANT[f.confidence]}>{f.confidence}</Badge>
                    </div>
                    <blockquote className="border-l-2 pl-2 text-muted-foreground">“{f.extractedText}”</blockquote>
                  </li>
                ))}
              </ul>
              {facts[0].query ? <p className="text-xs text-muted-foreground">Found by the search: {facts[0].query.replace(/\s*-site:linkedin\.com$/, "")}</p> : null}
            </li>
          ))}
        </ul>
      </Section>

      {detail.searches.length ? (
        <Section title="Discovered via">
          <ul className="grid gap-1">
            {detail.searches.map((s) => (
              <li key={s.searchId}>
                <Link href={`/discover/${s.searchId}`} className="underline-offset-4 hover:underline">
                  “{s.query}”
                </Link>
                {s.discoveredVia ? <span className="text-muted-foreground"> · query: {s.discoveredVia.replace(/\s*-site:linkedin\.com$/, "")}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <IntroAssistant personId={p.id} initial={detail.suggestedIntro} />

      <Section title="Feedback">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FEEDBACK_LABELS) as (keyof typeof FEEDBACK_LABELS)[]).map((k) => {
            const given = detail.feedback.includes(k);
            return (
              <Button
                key={k}
                size="sm"
                variant={given ? "default" : "outline"}
                aria-pressed={given}
                disabled={pending}
                onClick={() => run(() => (given ? undoPersonFeedback(p.id, k) : givePersonFeedback(p.id, k, searchId)))}
              >
                {FEEDBACK_LABELS[k]}
              </Button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Feedback adjusts this person&apos;s ranking now and in future searches.</p>
      </Section>

      <Section title="Notes and follow-up">
        <ActionForm action={updatePersonCrm} submitLabel="Save" size="sm">
          <input type="hidden" name="id" value={p.id} />
          <div className="grid gap-1.5">
            <Label htmlFor={`notes-${p.id}`}>Notes (private)</Label>
            <Textarea id={`notes-${p.id}`} name="notes" maxLength={5000} defaultValue={p.notes ?? ""} rows={3} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`tags-${p.id}`}>Tags</Label>
              <Input id={`tags-${p.id}`} name="tags" defaultValue={p.tags.join(", ")} placeholder="Comma-separated, e.g. school, field, follow up" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`category-${p.id}`}>Category</Label>
              <Input id={`category-${p.id}`} name="category" maxLength={60} defaultValue={p.category ?? ""} placeholder="e.g. Alumni" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`reminder-${p.id}`}>Reminder</Label>
              <Input id={`reminder-${p.id}`} name="reminder" type="date" defaultValue={p.reminder_at ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`li-${p.id}`}>LinkedIn profile link</Label>
              <Input id={`li-${p.id}`} name="linkedinUrl" defaultValue={p.linkedin_url ?? ""} placeholder="Paste after opening their profile yourself" />
            </div>
          </div>
        </ActionForm>
      </Section>

      <Section title="History">
        <ActionForm action={logPersonInteraction} submitLabel="Add" size="sm" resetOnSuccess>
          <input type="hidden" name="id" value={p.id} />
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr_9rem]">
            <div className="grid gap-1.5">
              <Label htmlFor={`kind-${p.id}`}>Type</Label>
              <AppSelect id={`kind-${p.id}`} name="kind" defaultValue="note">
                <option value="note">Note</option>
                <option value="replied">They replied</option>
                <option value="follow_up">Follow-up</option>
              </AppSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`body-${p.id}`}>What happened</Label>
              <Input id={`body-${p.id}`} name="body" maxLength={2000} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`date-${p.id}`}>Date</Label>
              <Input id={`date-${p.id}`} name="date" type="date" />
            </div>
          </div>
        </ActionForm>
        {detail.interactions.length ? (
          <ol className="grid gap-1">
            {detail.interactions.map((i) => (
              <li key={i.id} className="flex flex-wrap gap-2">
                <time dateTime={i.occurred_at} className="text-muted-foreground tabular-nums">
                  {new Date(i.occurred_at).toLocaleDateString("en-CA")}
                </time>
                <span>
                  {INTERACTION_LABELS[i.kind] ?? i.kind}
                  {i.body && i.kind !== "status_change" && i.kind !== "proximity" ? `: ${i.body}` : ""}
                  {i.kind === "status_change" && i.body ? `: ${CRM_STATUS_LABELS[i.body as keyof typeof CRM_STATUS_LABELS] ?? i.body}` : ""}
                  {i.kind === "proximity" && i.body ? `: ${PROXIMITY_LABELS[i.body as keyof typeof PROXIMITY_LABELS] ?? i.body}` : ""}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">Nothing yet.</p>
        )}
      </Section>
    </div>
  );
}

/** Suggested intro from verified facts. Copy it into LinkedIn yourself; the app never sends it. */
function IntroAssistant({ personId, initial }: { personId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const { pending, run } = useActionRunner();

  const polish = () =>
    run(() => generateIntro(personId, true), {
      progress: "Polishing your intro…",
      onSuccess: (r) => {
        if ("text" in r && typeof r.text === "string" && r.text) setText(r.text);
      },
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Intro copied.", "Paste it into LinkedIn yourself if you decide to connect.");
      void recordPersonEvent(personId, "message_copied");
    } catch {
      toast.warning("Couldn't copy automatically.", "Select the text and copy it.");
    }
  };

  return (
    <section className="grid gap-2 border-t pt-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Suggested intro (optional)</h3>
      <Label htmlFor={`intro-${personId}`} className="sr-only">
        Intro message
      </Label>
      <Textarea id={`intro-${personId}`} value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={INTRO_LIMIT} aria-describedby={`intro-count-${personId}`} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={copy}>
          Copy message
        </Button>
        <Button size="sm" variant="outline" onClick={polish} disabled={pending}>
          {pending ? "Polishing…" : "Polish with AI"}
        </Button>
        <span id={`intro-count-${personId}`} className="text-xs text-muted-foreground tabular-nums">
          {text.length}/{INTRO_LIMIT}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Uses only verified facts and what you wrote about yourself in Settings. Nothing is ever sent from this app.</p>
    </section>
  );
}
