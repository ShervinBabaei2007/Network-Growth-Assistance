"use client";

import { useState } from "react";
import Link from "next/link";
import { BellOff, Check, Clock, Copy } from "lucide-react";
import { checkFollowUpText, setFollowUpDue, setFollowUpState, snoozeFollowUp } from "./actions";
import { toast } from "@/components/toast/notify";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DueState } from "@/lib/follow-ups/templates";

export type FollowUpView = {
  id: string;
  candidateId: string;
  name: string;
  detail: string;
  title: string;
  dueOn: string;
  dueLabel: string;
  dueState: DueState;
  draft: string;
};

const BADGE: Record<DueState, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
  overdue: { label: "Overdue", variant: "destructive" },
  today: { label: "Due today", variant: "default" },
  soon: { label: "This week", variant: "secondary" },
  later: { label: "Later", variant: "outline" },
};

/** One suggested touch: who, what, when, an editable draft to copy, and what to do with it. */
export function FollowUpItem({ item }: { item: FollowUpView }) {
  const { pending, run } = useActionRunner();
  const [text, setText] = useState(item.draft);
  const badge = BADGE[item.dueState];
  const textId = `draft-${item.id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
      return;
    }
    // The message is the user's own, but say so if it states something the record can't back up.
    const checked = await checkFollowUpText(item.id, text).catch(() => null);
    const problem = checked?.ok ? checked.data?.problem : null;
    if (problem) toast.warning("Copied, but check it", `It ${problem}.`);
    else toast.success("Copied. Paste it into LinkedIn and send it yourself.");
  }

  return (
    <Card data-testid="follow-up" size="sm">
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="min-w-0">
            <Link href={`/candidates/${item.candidateId}`} className="underline-offset-4 hover:underline">
              {item.name}
            </Link>
            <span className="ml-2 text-sm font-normal text-muted-foreground">{item.title}</span>
          </CardTitle>
          <Badge variant={badge.variant}>
            {badge.label} · {item.dueLabel}
          </Badge>
        </div>
        {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={textId}>Draft message (edit it if you like)</Label>
          <Textarea id={textId} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void copy()}>
            <Copy aria-hidden /> Copy
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setFollowUpState(item.id, "done"), { undo: () => setFollowUpState(item.id, "suggested") })}>
            <Check aria-hidden /> Done
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => snoozeFollowUp(item.id), { undo: () => setFollowUpDue(item.id, item.dueOn) })}>
            <Clock aria-hidden /> Snooze a week
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setFollowUpState(item.id, "dismissed"), { undo: () => setFollowUpState(item.id, "suggested") })}>
            <BellOff aria-hidden /> Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
