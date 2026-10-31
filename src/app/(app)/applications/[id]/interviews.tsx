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
import { addInterview, deleteInterview, updateInterview, type InterviewInput } from "../actions";
import type { DetailData } from "./detail-data";
import type { InterviewKind } from "./detail-data";

const KIND_LABEL: Record<InterviewKind, string> = { phone: "Phone", video: "Video", onsite: "On-site", technical: "Technical", other: "Other" };

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
      <div className="grid gap-2 @@3xl:grid-cols-2">
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

export function Interviews({ data }: { data: DetailData }) {
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
