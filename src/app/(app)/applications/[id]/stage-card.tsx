"use client";

import { useTr } from "@/lib/i18n/client";
import { useState } from "react";
import Link from "next/link";
import { AppSelect } from "@/components/app-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { isClosed, STAGES, type Stage } from "@/lib/applications/stages";
import { useStageText } from "../tracker-shared";
import { applyAgain, moveStage } from "../actions";
import type { DetailData } from "./detail-data";

export function StageCard({ data }: { data: DetailData }) {
  const { tr, label, hint } = useStageText();
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
        <CardTitle>{tr("msg.stage64c6", tr("msg.stage64c6", "Stage"))}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-48 flex-1 gap-1">
            <Label htmlFor="stage">{tr("msg.stage64c6", tr("msg.stage64c6", "Stage"))}</Label>
            <AppSelect id="stage" value={to} onChange={(e) => setTo(e.target.value as Stage)} aria-describedby="stage-hint">
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </AppSelect>
          </div>
          <Button size="sm" disabled={pending || to === data.stage} onClick={move}>
            {isClosed(data.stage) && !isClosed(to) ? tr("msg.reopenb824", "Reopen") : tr("msg.move6bc3", "Move")}
          </Button>
        </div>
        <p id="stage-hint" className="text-xs text-muted-foreground">
          {label(to)} : {hint(to)}.
        </p>
        {isClosed(data.stage) && data.jobId ? (
          <div className="grid gap-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">{tr("msg.applyingToThisJob6a47", tr("msg.applyingToThisJob6a47", "Applying to this job again? Start a new attempt; this one keeps its history."))}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => applyAgain(data.id, "saved"))}>
                {tr("msg.newAttemptSavedb08f", tr("msg.newAttemptSavedb08f", "New attempt (saved)"))}
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => applyAgain(data.id, "applied"))}>
                {tr("msg.newAttemptApplied187c", tr("msg.newAttemptApplied187c", "New attempt (applied)"))}
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
