"use client";

import { useState } from "react";
import { Check, Copy, HandHelping, Sparkles, X } from "lucide-react";
import { decideCompanies, draftReferralAsk, forgetCompanyDecision, recordReferral, undoReferral } from "@/app/(app)/companies/actions";
import { recordPersonEvent } from "@/app/(app)/people/actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** "Same company?" for a possible match. The answer applies to every person at that name. */
export function SameCompanyButtons({ jobCompany, theirCompany }: { jobCompany: string; theirCompany: string }) {
  const { pending, run } = useActionRunner();
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-muted-foreground">Is “{theirCompany}” the same company as “{jobCompany}”?</span>
      <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => decideCompanies(jobCompany, theirCompany, "same"), { undo: () => forgetCompanyDecision(jobCompany, theirCompany) })}>
        <Check aria-hidden /> Yes
      </Button>
      <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => decideCompanies(jobCompany, theirCompany, "different"), { undo: () => forgetCompanyDecision(jobCompany, theirCompany) })}>
        <X aria-hidden /> No
      </Button>
    </span>
  );
}

/** Record a referral, and draft a message to ask for one (copied by the user, never sent). */
export function ReferralActions({ personId, personName, applicationId, aiAvailable }: { personId: string; personName: string; applicationId: string | null; aiAvailable: boolean }) {
  const { pending, run } = useActionRunner();
  const [draft, setDraft] = useState<{ text: string; source: "template" | "ai" } | null>(null);
  const record = (kind: "referral_asked" | "referral_given") => run(() => recordReferral(personId, applicationId, kind), { undo: () => undoReferral(personId, applicationId, kind) });
  const makeDraft = (useAi: boolean) =>
    run(async () => {
      const r = await draftReferralAsk(personId, applicationId!, useAi);
      if (r.ok && r.data) setDraft(r.data);
      return r;
    });
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1">
        <Button size="xs" variant="outline" disabled={pending} onClick={() => record("referral_asked")}>
          <HandHelping aria-hidden /> I asked for a referral
        </Button>
        <Button size="xs" variant="outline" disabled={pending} onClick={() => record("referral_given")}>
          <Check aria-hidden /> They referred me
        </Button>
        {applicationId ? (
          <>
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => makeDraft(false)}>
              Draft a message
            </Button>
            {aiAvailable ? (
              <Button size="xs" variant="ghost" disabled={pending} onClick={() => makeDraft(true)}>
                <Sparkles aria-hidden /> Draft with AI
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      {draft ? (
        <div className="grid gap-1">
          <Label htmlFor={`draft-${personId}`} className="text-xs">
            {draft.source === "ai" ? "AI-polished draft" : "Template"} for {personName}. Edit it, then copy it into LinkedIn yourself.
          </Label>
          <Textarea id={`draft-${personId}`} rows={5} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <Button
            size="xs"
            variant="outline"
            className="justify-self-start"
            onClick={async () => {
              await navigator.clipboard.writeText(draft.text);
              await recordPersonEvent(personId, "message_copied");
              run(async () => ({ ok: true, message: "Copied. Nothing was sent." }));
            }}
          >
            <Copy aria-hidden /> Copy
          </Button>
        </div>
      ) : null}
    </div>
  );
}
