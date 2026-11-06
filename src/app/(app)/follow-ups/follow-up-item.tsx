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
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";

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

const BADGE: Record<DueState, { label: MessageKey; variant: "destructive" | "default" | "secondary" | "outline" }> = {
  overdue: { label: "followUps.overdue", variant: "destructive" },
  today: { label: "followUps.dueToday", variant: "default" },
  soon: { label: "followUps.thisWeek", variant: "secondary" },
  later: { label: "followUps.later", variant: "outline" },
};

/** One suggested touch: who, what, when, an editable draft to copy, and what to do with it. */
export function FollowUpItem({ item }: { item: FollowUpView }) {
  const { pending, run } = useActionRunner();
  const t = useT();
  const [text, setText] = useState(item.draft);
  const badge = BADGE[item.dueState];
  const textId = `draft-${item.id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error(t("followUps.copyFailed"));
      return;
    }
    // The message is the user's own, but say so if it states something the record can't back up.
    const checked = await checkFollowUpText(item.id, text).catch(() => null);
    const problem = checked?.ok ? checked.data?.problem : null;
    if (problem) toast.warning(t("followUps.copiedCheck"), t("followUps.copiedProblem", { problem }));
    else toast.success(t("followUps.copied"));
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
            {t(badge.label)} · {item.dueLabel}
          </Badge>
        </div>
        {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={textId}>{t("followUps.draftLabel")}</Label>
          <Textarea id={textId} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void copy()}>
            <Copy aria-hidden /> {t("followUps.copy")}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setFollowUpState(item.id, "done"), { undo: () => setFollowUpState(item.id, "suggested") })}>
            <Check aria-hidden /> {t("followUps.done")}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => snoozeFollowUp(item.id), { undo: () => setFollowUpDue(item.id, item.dueOn) })}>
            <Clock aria-hidden /> {t("followUps.snooze")}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setFollowUpState(item.id, "dismissed"), { undo: () => setFollowUpState(item.id, "suggested") })}>
            <BellOff aria-hidden /> {t("followUps.dismiss")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
