"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, Pencil, Trash2, Undo2 } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isClosed, PAY_PERIODS, STAGE_HINT, STAGE_LABEL, STAGES, type PayPeriod, type Stage } from "@/lib/applications/stages";
import { cn } from "@/lib/utils";
import {
  addInterview,
  addNote,
  addReminder,
  applyAgain,
  deleteInterview,
  deleteNote,
  deleteReminder,
  linkContact,
  linkDocument,
  moveStage,
  saveDetails,
  setReminderDone,
  unlinkContact,
  unlinkDocument,
  updateInterview,
  type InterviewInput,
} from "../actions";

type InterviewKind = "phone" | "video" | "onsite" | "technical" | "other";

export type DetailData = {
  id: string;
  stage: Stage;
  version: number;
  attempt: number;
  jobId: string | null;
  timezone: string;
  details: { notes: string; appliedOn: string; payAmount: string; payCurrency: string; payPeriod: PayPeriod | "" };
  timeline: { id: string; kind: string; label: string; detail: string | null; when: string; removable: boolean }[];
  interviews: {
    id: string;
    when: string;
    relative: string;
    past: boolean;
    startsLocal: string;
    timezone: string;
    durationMinutes: number;
    kind: InterviewKind;
    location: string;
    notes: string;
    scheduledIn: string | null;
  }[];
  reminders: { id: string; text: string; when: string; relative: string; overdue: boolean; done: boolean }[];
  contacts: { personId: string; role: string; name: string; title: string }[];
  documents: { id: string; label: string; linkedOn: string; sourceGone: boolean }[];
  options: { people: { id: string; label: string }[]; tailored: { id: string; label: string }[]; resumes: { id: string; label: string }[] };
  otherAttempts: { id: string; label: string }[];
  nowLocal: string;
};

const KIND_LABEL: Record<InterviewKind, string> = { phone: "Phone", video: "Video", onsite: "On-site", technical: "Technical", other: "Other" };
const ROLE_LABEL: Record<string, string> = { recruiter: "Recruiter", hiring_manager: "Hiring manager", referrer: "Referrer", interviewer: "Interviewer", other: "Other" };

export function ApplicationDetail({ data }: { data: DetailData }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid content-start gap-6">
        <StageCard data={data} />
        <Timeline data={data} />
      </div>
      <div className="grid content-start gap-6">
        <Interviews data={data} />
        <Reminders data={data} />
        <Contacts data={data} />
        <Documents data={data} />
        <Details data={data} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ stage

function StageCard({ data }: { data: DetailData }) {
  const { pending, run } = useActionRunner();
  const [to, setTo] = useState<Stage>(data.stage);
  const move = () => {
    if (to === data.stage) return;
    let version = data.version + 1;
    run(
      async () => {
        const r = await moveStage(data.id, to, data.version);
        if (r.ok && r.data) version = r.data.version;
        return r;
      },
      { undo: () => moveStage(data.id, data.stage, version) },
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stage</CardTitle>
        <CardDescription>Move it when something happens. Moves can go back or reopen a closed application; each one is on the timeline.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-48 flex-1 gap-1">
            <Label htmlFor="stage">Stage</Label>
            <AppSelect id="stage" value={to} onChange={(e) => setTo(e.target.value as Stage)} aria-describedby="stage-hint">
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </AppSelect>
          </div>
          <Button size="sm" disabled={pending || to === data.stage} onClick={move}>
            {isClosed(data.stage) && !isClosed(to) ? "Reopen" : "Move"}
          </Button>
        </div>
        <p id="stage-hint" className="text-xs text-muted-foreground">
          {STAGE_LABEL[to]}: {STAGE_HINT[to]}.
        </p>
        {isClosed(data.stage) && data.jobId ? (
          <div className="grid gap-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">Applying to this job again? Start a new attempt; this one keeps its history.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => applyAgain(data.id, "saved"))}>
                New attempt (saved)
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => applyAgain(data.id, "applied"))}>
                New attempt (applied)
              </Button>
            </div>
          </div>
        ) : null}
        {data.otherAttempts.length ? (
          <ul className="grid gap-1 border-t pt-3 text-sm">
            {data.otherAttempts.map((a) => (
              <li key={a.id}>
                <Link href={`/applications/${a.id}`} className="text-primary hover:underline">
                  {a.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ timeline

function Timeline({ data }: { data: DetailData }) {
  const { pending, run } = useActionRunner();
  const [kind, setKind] = useState<"note" | "response">("note");
  const [text, setText] = useState("");
  const add = () => {
    let id = "";
    run(
      async () => {
        const r = await addNote(data.id, kind, text);
        if (r.ok) {
          id = r.data?.id ?? "";
          setText("");
        }
        return r;
      },
      { undo: () => deleteNote(id) },
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardDescription>Stage moves are recorded automatically. Add notes, and record responses you received yourself.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <div className="grid gap-1">
              <Label htmlFor="note-kind">Type</Label>
              <AppSelect id="note-kind" value={kind} onChange={(e) => setKind(e.target.value as "note" | "response")} className="w-40">
                <option value="note">Note</option>
                <option value="response">Response received</option>
              </AppSelect>
            </div>
          </div>
          <Label htmlFor="note-text" className="sr-only">
            {kind === "note" ? "Note" : "Response"}
          </Label>
          <Textarea id="note-text" value={text} maxLength={2000} rows={3} onChange={(e) => setText(e.target.value)} placeholder={kind === "note" ? "e.g. Followed up with the recruiter by email" : "e.g. Invited to a phone screen next week"} />
          <Button type="submit" size="sm" className="justify-self-start" disabled={pending || !text.trim()}>
            Add to timeline
          </Button>
        </form>
        {data.timeline.length ? (
          <ol className="grid gap-3 border-l pl-4">
            {data.timeline.map((e) => (
              <li key={e.id} className="relative grid gap-0.5 text-sm">
                <span aria-hidden className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{e.label}</span>
                  <span className="text-xs text-muted-foreground">{e.when}</span>
                </div>
                {e.detail ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{e.detail}</p> : null}
                {e.removable ? (
                  <Button size="xs" variant="ghost" className="justify-self-start" disabled={pending} onClick={() => run(() => deleteNote(e.id))} aria-label={`Remove this ${e.kind}`}>
                    <Trash2 aria-hidden /> Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing on the timeline yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ interviews

const emptyInterview = (data: DetailData): InterviewInput => ({ startsLocal: "", timezone: data.timezone, durationMinutes: 60, kind: "video", location: "", notes: "" });

function InterviewForm({ initial, submitLabel, pending, onSubmit, onCancel }: { initial: InterviewInput; submitLabel: string; pending: boolean; onSubmit: (v: InterviewInput) => void; onCancel?: () => void }) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof InterviewInput>(k: K, value: InterviewInput[K]) => setV({ ...v, [k]: value });
  const idp = `iv-${submitLabel.replace(/\W/g, "")}`;
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-when`}>Date and time</Label>
          <Input id={`${idp}-when`} type="datetime-local" required value={v.startsLocal} onChange={(e) => set("startsLocal", e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-tz`}>Time zone</Label>
          <Input id={`${idp}-tz`} required value={v.timezone} onChange={(e) => set("timezone", e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-len`}>Length (minutes)</Label>
          <Input id={`${idp}-len`} type="number" min={5} max={1440} required value={String(v.durationMinutes)} onChange={(e) => set("durationMinutes", Number(e.target.value))} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-kind`}>Type</Label>
          <AppSelect id={`${idp}-kind`} value={v.kind} onChange={(e) => set("kind", e.target.value as InterviewKind)}>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </AppSelect>
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${idp}-where`}>Where</Label>
        <Input id={`${idp}-where`} maxLength={500} value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="Address, or how to join" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${idp}-notes`}>Notes</Label>
        <Textarea id={`${idp}-notes`} maxLength={5000} rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Interviews({ data }: { data: DetailData }) {
  const { pending, run } = useActionRunner();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; input: InterviewInput } | null>(null);
  const save = (id: string, input: InterviewInput, confirmed: boolean) =>
    run(async () => {
      const r = await updateInterview(id, input, confirmed);
      if (!r.ok && r.data?.needsConfirmation) {
        setConfirm({ id, input });
        return { ok: true, message: undefined };
      }
      if (r.ok) {
        setEditing(null);
        setConfirm(null);
      }
      return r;
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Interviews</CardTitle>
        <CardDescription>Times show in your time zone ({data.timezone}).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {data.interviews.length ? (
          <ul className="grid gap-3">
            {data.interviews.map((i) =>
              editing === i.id ? (
                <li key={i.id} className="rounded-lg border p-3">
                  {confirm?.id === i.id ? (
                    <div role="alertdialog" aria-labelledby={`confirm-${i.id}`} className="grid gap-2">
                      <p id={`confirm-${i.id}`} className="text-sm">
                        Change this interview to {confirm.input.startsLocal.replace("T", " ")} ({confirm.input.timezone})? If you added it to a calendar, download the calendar file again to
                        update it.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={pending} onClick={() => save(i.id, confirm.input, true)}>
                          Change the time
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                          Keep the old time
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <InterviewForm
                      initial={{ startsLocal: i.startsLocal, timezone: i.timezone, durationMinutes: i.durationMinutes, kind: i.kind, location: i.location, notes: i.notes }}
                      submitLabel="Save interview"
                      pending={pending}
                      onSubmit={(v) => save(i.id, v, false)}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </li>
              ) : (
                <li key={i.id} className={cn("grid gap-1 rounded-lg border p-3 text-sm", i.past && "opacity-75")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {KIND_LABEL[i.kind]} · {i.when}
                    </span>
                    <span className="text-xs text-muted-foreground">{i.relative}</span>
                  </div>
                  {i.scheduledIn ? <span className="text-xs text-muted-foreground">Scheduled as {i.scheduledIn}</span> : null}
                  {i.location ? <span className="break-words text-muted-foreground">{i.location}</span> : null}
                  {i.notes ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{i.notes}</p> : null}
                  <div className="flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setEditing(i.id)}>
                      <Pencil aria-hidden /> Edit
                    </Button>
                    <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => deleteInterview(i.id))}>
                      <Trash2 aria-hidden /> Remove
                    </Button>
                  </div>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No interviews yet.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {data.interviews.length ? (
            <a href={`/api/applications/${data.id}/interviews`} download className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[0.8rem] font-medium hover:bg-muted">
              <CalendarPlus aria-hidden className="size-3.5" /> Add to calendar (.ics)
            </a>
          ) : null}
          {!adding ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              Add an interview
            </Button>
          ) : null}
        </div>
        {adding ? (
          <div className="rounded-lg border p-3">
            <InterviewForm
              initial={emptyInterview(data)}
              submitLabel="Add interview"
              pending={pending}
              onSubmit={(v) =>
                run(async () => {
                  const r = await addInterview(data.id, v);
                  if (r.ok) setAdding(false);
                  return r;
                })
              }
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ reminders

function Reminders({ data }: { data: DetailData }) {
  const { pending, run } = useActionRunner();
  const [due, setDue] = useState("");
  const [text, setText] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminders</CardTitle>
        <CardDescription>Due reminders show on your Overview.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {data.reminders.length ? (
          <ul className="grid gap-2">
            {data.reminders.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
                <label className="flex min-w-0 items-start gap-2">
                  <Checkbox
                    className="mt-1"
                    checked={r.done}
                    disabled={pending}
                    onCheckedChange={(done) => {
                      run(() => setReminderDone(r.id, done), { undo: () => setReminderDone(r.id, !done) });
                    }}
                  />
                  <span className={cn("min-w-0 break-words", r.done && "text-muted-foreground line-through")}>
                    {r.text}
                    <span className={cn("block text-xs", r.overdue ? "text-destructive" : "text-muted-foreground")}>
                      {r.when} ({r.relative})
                    </span>
                  </span>
                </label>
                <Button size="icon-xs" variant="ghost" aria-label={`Remove reminder: ${r.text}`} title={`Remove reminder: ${r.text}`} disabled={pending} onClick={() => run(() => deleteReminder(r.id))}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No reminders.</p>
        )}
        <form
          className="grid gap-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await addReminder(data.id, due, text);
              if (r.ok) {
                setText("");
                setDue("");
              }
              return r;
            });
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="reminder-text">Remind me to</Label>
            <Input id="reminder-text" required maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Follow up with the recruiter" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="reminder-due">When</Label>
            <Input id="reminder-due" type="datetime-local" required min={data.nowLocal} value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <Button type="submit" size="sm" variant="outline" className="justify-self-start" disabled={pending}>
            Add reminder
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ contacts

function Contacts({ data }: { data: DetailData }) {
  const { pending, run } = useActionRunner();
  const [person, setPerson] = useState("");
  const [role, setRole] = useState<"recruiter" | "hiring_manager" | "referrer" | "interviewer" | "other">("recruiter");
  const linked = new Set(data.contacts.map((c) => c.personId));
  const available = data.options.people.filter((p) => !linked.has(p.id));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contacts</CardTitle>
        <CardDescription>People from your People list who are part of this application.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {data.contacts.length ? (
          <ul className="grid gap-2">
            {data.contacts.map((c) => (
              <li key={c.personId} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <Link href={`/people/${c.personId}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>{" "}
                  <span className="text-muted-foreground">· {ROLE_LABEL[c.role] ?? c.role}</span>
                  {c.title ? <span className="block text-xs break-words text-muted-foreground">{c.title}</span> : null}
                </span>
                <Button size="icon-xs" variant="ghost" aria-label={`Unlink ${c.name}`} title={`Unlink ${c.name}`} disabled={pending} onClick={() => run(() => unlinkContact(data.id, c.personId), { undo: () => linkContact(data.id, c.personId, c.role as typeof role) })}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No contacts linked.</p>
        )}
        {available.length ? (
          <form
            className="grid gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (person) run(() => linkContact(data.id, person, role), { undo: () => unlinkContact(data.id, person) });
            }}
          >
            <div className="grid gap-1">
              <Label htmlFor="contact-person">Person</Label>
              <AppSelect id="contact-person" value={person} onChange={(e) => setPerson(e.target.value)} required>
                <option value="">Choose someone…</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </AppSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="contact-role">Role</Label>
              <AppSelect id="contact-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                {Object.entries(ROLE_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </AppSelect>
            </div>
            <Button type="submit" size="sm" variant="outline" className="justify-self-start" disabled={pending || !person}>
              Link contact
            </Button>
          </form>
        ) : data.options.people.length ? null : (
          <p className="text-xs text-muted-foreground">
            Save people in <Link href="/people" className="text-primary hover:underline">People</Link> to link them here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ documents

function Documents({ data }: { data: DetailData }) {
  const { pending, run } = useActionRunner();
  const [choice, setChoice] = useState("");
  const options = [...data.options.tailored.map((t) => ({ value: `t:${t.id}`, label: t.label })), ...data.options.resumes.map((r) => ({ value: `r:${r.id}`, label: r.label }))];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents sent</CardTitle>
        <CardDescription>Which version you sent. A copy is kept here even if you later edit or delete the original.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {data.documents.length ? (
          <ul className="grid gap-2">
            {data.documents.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0 break-words">
                  {d.label}
                  <span className="block text-xs text-muted-foreground">
                    Linked {d.linkedOn}
                    {d.sourceGone ? " · original deleted, copy kept" : ""}
                  </span>
                </span>
                <Button size="icon-xs" variant="ghost" aria-label={`Unlink ${d.label}`} title={`Unlink ${d.label}`} disabled={pending} onClick={() => run(() => unlinkDocument(d.id))}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No documents linked.</p>
        )}
        {options.length ? (
          <form
            className="grid gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const [kind, id] = choice.split(":");
              if (id) run(() => linkDocument(data.id, kind === "t" ? { tailoredId: id } : { resumeId: id }));
            }}
          >
            <div className="grid gap-1">
              <Label htmlFor="doc-choice">Version</Label>
              <AppSelect id="doc-choice" value={choice} onChange={(e) => setChoice(e.target.value)} required>
                <option value="">Choose a document…</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AppSelect>
            </div>
            <Button type="submit" size="sm" variant="outline" className="justify-self-start" disabled={pending || !choice}>
              Link document
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ details

function Details({ data }: { data: DetailData }) {
  const { pending, run } = useActionRunner();
  const [v, setV] = useState(data.details);
  const set = <K extends keyof DetailData["details"]>(k: K, value: DetailData["details"][K]) => setV({ ...v, [k]: value });
  const changed = JSON.stringify(v) !== JSON.stringify(data.details);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>Pay is kept exactly as you enter it, in its own currency and period.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveDetails(data.id, v), { undo: () => saveDetails(data.id, data.details) });
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="applied-on">Date applied</Label>
            <Input id="applied-on" type="date" value={v.appliedOn} onChange={(e) => set("appliedOn", e.target.value)} />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Offered pay</legend>
            <div className="grid grid-cols-[2fr_1fr] gap-2 sm:grid-cols-[2fr_1fr_1.5fr]">
              <div className="grid gap-1">
                <Label htmlFor="pay-amount" className="text-xs text-muted-foreground">
                  Amount
                </Label>
                <Input id="pay-amount" inputMode="decimal" value={v.payAmount} onChange={(e) => set("payAmount", e.target.value)} placeholder="85000" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="pay-currency" className="text-xs text-muted-foreground">
                  Currency
                </Label>
                <Input id="pay-currency" maxLength={3} value={v.payCurrency} onChange={(e) => set("payCurrency", e.target.value.toUpperCase())} placeholder="CAD" />
              </div>
              <div className="col-span-2 grid gap-1 sm:col-span-1">
                <Label htmlFor="pay-period" className="text-xs text-muted-foreground">
                  Per
                </Label>
                <AppSelect id="pay-period" value={v.payPeriod} onChange={(e) => set("payPeriod", e.target.value as PayPeriod | "")}>
                  <option value="">—</option>
                  {PAY_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </AppSelect>
              </div>
            </div>
          </fieldset>
          <div className="grid gap-1">
            <Label htmlFor="app-notes">Notes</Label>
            <Textarea id="app-notes" rows={4} maxLength={10000} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending || !changed}>
              <Check aria-hidden /> Save details
            </Button>
            {changed ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setV(data.details)}>
                <Undo2 aria-hidden /> Discard changes
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
