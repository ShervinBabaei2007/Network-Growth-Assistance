"use client";

import { useTr } from "@/lib/i18n/client";
import { useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DraftBanner } from "@/components/draft-banner";
import { useDraft } from "@/hooks/use-draft";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { draftKey } from "@/lib/drafts";
import { PAY_PERIODS, type PayPeriod } from "@/lib/applications/stages";
import { saveDetails } from "../actions";
import type { DetailData } from "./detail-data";

export function Details({ data }: { data: DetailData }) {
  const tr = useTr();
  const { pending, run } = useActionRunner();
  const [v, setV] = useState(data.details);
  const set = <K extends keyof DetailData["details"]>(k: K, value: DetailData["details"][K]) => setV({ ...v, [k]: value });
  const changed = JSON.stringify(v) !== JSON.stringify(data.details);
  useUnsavedChanges(changed);
  // The notes are the part worth keeping if the tab dies; the rest are short fields that are quick to retype.
  const draft = useDraft(draftKey("application-notes", data.id), v.notes, data.details.notes);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr("msg.details3ec3", "Details")}</CardTitle>
        <CardDescription>{tr("msg.payIsKeptExactly09cb", "Pay is kept exactly as you enter it, in its own currency and period.")}</CardDescription>
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
            <Label htmlFor="applied-on">{tr("msg.dateApplied7db1", "Date applied")}</Label>
            <Input id="applied-on" type="date" value={v.appliedOn} onChange={(e) => set("appliedOn", e.target.value)} />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{tr("msg.offeredPay42a0", "Offered pay")}</legend>
            <div className="grid grid-cols-[2fr_1fr] gap-2 @@3xl:grid-cols-[2fr_1fr_1.5fr]">
              <div className="grid gap-1">
                <Label htmlFor="pay-amount" className="text-xs text-muted-foreground">
                  {tr("msg.amountb2f4", "Amount")}
                </Label>
                <Input id="pay-amount" inputMode="decimal" value={v.payAmount} onChange={(e) => set("payAmount", e.target.value)} placeholder="85000" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="pay-currency" className="text-xs text-muted-foreground">
                  {tr("msg.currency386c", "Currency")}
                </Label>
                <Input id="pay-currency" maxLength={3} value={v.payCurrency} onChange={(e) => set("payCurrency", e.target.value.toUpperCase())} placeholder="CAD" />
              </div>
              <div className="col-span-2 grid gap-1 sm:col-span-1">
                <Label htmlFor="pay-period" className="text-xs text-muted-foreground">
                  {tr("msg.perbc50", "Per")}
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
          {draft.offered !== null ? <DraftBanner what="note" onRestore={() => set("notes", draft.accept() ?? "")} onDiscard={draft.discard} /> : null}
          <div className="grid gap-1">
            <Label htmlFor="app-notes">{tr("msg.notesf4c6", "Notes")}</Label>
            <Textarea id="app-notes" rows={4} maxLength={10000} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending || !changed}>
              <Check aria-hidden /> {tr("msg.saveDetailscccd", "Save details")}
            </Button>
            {changed ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setV(data.details)}>
                <Undo2 aria-hidden /> {tr("msg.discardChanges9831", "Discard changes")}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

