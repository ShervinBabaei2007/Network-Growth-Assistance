"use client";

import { useState } from "react";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useTr } from "@/lib/i18n/client";
import { addInterview, deleteInterview, updateInterview, type InterviewInput } from "../actions";
import type { DetailData } from "./detail-data";
import type { InterviewKind } from "./detail-data";

const KIND_LABEL: Record<InterviewKind, string> = { phone: "Phone", video: "Video", onsite: "On-site", technical: "Technical", other: "Other" };

const kindLabel = (tr: ReturnType<typeof useTr>, k: InterviewKind) => tr(`appRecord.kind_${k}` as "appRecord.kind_phone", KIND_LABEL[k]);

const emptyInterview = (data: DetailData): InterviewInput => ({ startsLocal: "", timezone: data.timezone, durationMinutes: 60, kind: "video", location: "", notes: "" });

function InterviewForm({ initial, submitLabel, pending, onSubmit, onCancel }: { initial: InterviewInput; submitLabel: string; pending: boolean; onSubmit: (v: InterviewInput) => void; onCancel?: () => void }) {
  const tr = useTr();
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
      <div className="grid gap-2 @@3xl:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-when`}>{tr("msg.dateAndTime2b0b", tr("msg.dateAndTime2b0b", "Date and time"))}</Label>
          <Input id={`${idp}-when`} type="datetime-local" required value={v.startsLocal} onChange={(e) => set("startsLocal", e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-tz`}>{tr("msg.timeZone1c96", tr("msg.timeZone1c96", "Time zone"))}</Label>
          <Input id={`${idp}-tz`} required value={v.timezone} onChange={(e) => set("timezone", e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-len`}>{tr("msg.lengthMinutesf3af", tr("msg.lengthMinutesf3af", "Length (minutes)"))}</Label>
          <Input id={`${idp}-len`} type="number" min={5} max={1440} required value={String(v.durationMinutes)} onChange={(e) => set("durationMinutes", Number(e.target.value))} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-kind`}>{tr("msg.typea1fa", tr("msg.typea1fa", "Type"))}</Label>
          <AppSelect id={`${idp}-kind`} value={v.kind} onChange={(e) => set("kind", e.target.value as InterviewKind)}>
            {(Object.keys(KIND_LABEL) as InterviewKind[]).map((k) => (
              <option key={k} value={k}>
                {kindLabel(tr, k)}
              </option>
            ))}
          </AppSelect>
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${idp}-where`}>{tr("msg.whereb3c5", tr("msg.whereb3c5", "Where"))}</Label>
        <Input id={`${idp}-where`} maxLength={500} value={v.location} onChange={(e) => set("location", e.target.value)} placeholder={tr("msg.addressOrHowTo2505", tr("msg.addressOrHowTo2505", "Address, or how to join"))} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${idp}-notes`}>{tr("msg.notesf4c6", tr("msg.notesf4c6", "Notes"))}</Label>
        <Textarea id={`${idp}-notes`} maxLength={5000} rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {tr("msg.cancelea47", tr("msg.cancelea47", "Cancel"))}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function Interviews({ data }: { data: DetailData }) {
  const { pending, run } = useActionRunner();
  const tr = useTr();
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
        <CardTitle>{tr("msg.interviewsa830", tr("msg.interviewsa830", "Interviews"))}</CardTitle>
        <CardDescription>{tr("appRecord.timesShow", "Times show in your time zone ({zone}).", { zone: data.timezone })}</CardDescription>
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
                        {tr("appRecord.confirmChange", "Change this interview to {when} ({zone})? If you added it to a calendar, download the calendar file again to update it.", { when: confirm.input.startsLocal.replace("T", " "), zone: confirm.input.timezone })}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={pending} onClick={() => save(i.id, confirm.input, true)}>
                          {tr("msg.changeTheTime55cd", tr("msg.changeTheTime55cd", "Change the time"))}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                          {tr("msg.keepTheOldTimef225", tr("msg.keepTheOldTimef225", "Keep the old time"))}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <InterviewForm
                      initial={{ startsLocal: i.startsLocal, timezone: i.timezone, durationMinutes: i.durationMinutes, kind: i.kind, location: i.location, notes: i.notes }}
                      submitLabel={tr("msg.saveInterview73bc", tr("msg.saveInterview73bc", "Save interview"))}
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
                      {kindLabel(tr, i.kind)} · {i.when}
                    </span>
                    <span className="text-xs text-muted-foreground">{i.relative}</span>
                  </div>
                  {i.scheduledIn ? <span className="text-xs text-muted-foreground">{tr("appRecord.scheduledAs", "Scheduled as {value}", { value: i.scheduledIn })}</span> : null}
                  {i.location ? <span className="break-words text-muted-foreground">{i.location}</span> : null}
                  {i.notes ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{i.notes}</p> : null}
                  <div className="flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setEditing(i.id)}>
                      <Pencil aria-hidden /> {tr("msg.edit7dce", tr("msg.edit7dce", "Edit"))}
                    </Button>
                    <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => deleteInterview(i.id))}>
                      <Trash2 aria-hidden /> {tr("msg.remove1063", tr("msg.remove1063", "Remove"))}
                    </Button>
                  </div>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{tr("msg.noInterviewsYetb921", tr("msg.noInterviewsYetb921", "No interviews yet."))}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {data.interviews.length ? (
            <a href={`/api/applications/${data.id}/interviews`} download className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[0.8rem] font-medium hover:bg-muted">
              <CalendarPlus aria-hidden className="size-3.5" /> {tr("msg.addToCalendarIcsab2d", tr("msg.addToCalendarIcsab2d", "Add to calendar (.ics)"))}
            </a>
          ) : null}
          {!adding ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              {tr("msg.addAnInterview1860", tr("msg.addAnInterview1860", "Add an interview"))}
            </Button>
          ) : null}
        </div>
        {adding ? (
          <div className="rounded-lg border p-3">
            <InterviewForm
              initial={emptyInterview(data)}
              submitLabel={tr("msg.addInterviewac93", tr("msg.addInterviewac93", "Add interview"))}
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
