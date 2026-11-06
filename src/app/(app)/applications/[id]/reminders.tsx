"use client";

import { useTr } from "@/lib/i18n/client";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { addReminder, deleteReminder, setReminderDone } from "../actions";
import type { DetailData } from "./detail-data";

export function Reminders({ data }: { data: DetailData }) {
  const tr = useTr();
  const { pending, run } = useActionRunner();
  const [due, setDue] = useState("");
  const [text, setText] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr("msg.remindersd594", tr("msg.remindersd594", "Reminders"))}</CardTitle>
        <CardDescription>{tr("msg.dueRemindersShowOnd89b", tr("msg.dueRemindersShowOnd89b", "Due reminders show on your Overview."))}</CardDescription>
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
                <Button size="icon-xs" variant="ghost" aria-label={tr("appRecord.removeReminder", "Remove reminder: {text}", { text: r.text })} title={tr("appRecord.removeReminder", "Remove reminder: {text}", { text: r.text })} disabled={pending} onClick={() => run(() => deleteReminder(r.id))}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{tr("msg.noReminders94ec", tr("msg.noReminders94ec", "No reminders."))}</p>
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
            <Label htmlFor="reminder-text">{tr("msg.remindMeToa2ab", tr("msg.remindMeToa2ab", "Remind me to"))}</Label>
            <Input id="reminder-text" required maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("msg.eGFollowUp9910", tr("msg.eGFollowUp9910", "e.g. Follow up with the recruiter"))} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="reminder-due">{tr("msg.when4e97", tr("msg.when4e97", "When"))}</Label>
            <Input id="reminder-due" type="datetime-local" required min={data.nowLocal} value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <Button type="submit" size="sm" variant="outline" className="justify-self-start" disabled={pending}>
            {tr("msg.addReminder4e7c", tr("msg.addReminder4e7c", "Add reminder"))}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
