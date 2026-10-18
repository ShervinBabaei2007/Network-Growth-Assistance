"use client";

import { Disclosure } from "@/components/disclosure";
import { useState } from "react";
import { Download, Trash2, Undo2 } from "lucide-react";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SECTION_HEADINGS } from "@/lib/job-postings/document-sections";
import type { CoverLetterDoc, GuardIssue, TailoredResumeDoc } from "@/lib/job-postings/documents";
import { discardDocumentEdit, saveDocumentEdit } from "../documents/actions";

function useSave(docId: string) {
  const { pending, run, last: message } = useActionRunner();
  const save = (content: unknown) => run(() => saveDocumentEdit(docId, content));
  /** Goes back to the generated version; `onDone` puts it back in the editor. */
  const discard = (onDone: () => void) => run(() => discardDocumentEdit(docId), { onSuccess: onDone });
  return { pending, message, save, discard };
}

function Toolbar({ docId, edited, pending, message, onSave, onDiscard }: { docId: string; edited: boolean; pending: boolean; message: { ok: boolean; text: string } | null; onSave: () => void; onDiscard: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={onSave} disabled={pending}>
        {pending ? "Saving…" : "Save edits"}
      </Button>
      {edited ? (
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={pending}>
          <Undo2 aria-hidden /> Back to generated
        </Button>
      ) : null}
      <a href={`/api/jobs/documents/${docId}/download?format=pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Download aria-hidden /> PDF
      </a>
      <a href={`/api/jobs/documents/${docId}/download?format=docx`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Download aria-hidden /> Word (DOCX)
      </a>
      <span className="text-xs text-muted-foreground">Downloads use your last saved version.</span>
      {message ? <p className={message.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{message.text}</p> : null}
    </div>
  );
}

export function GuardReport({ issues }: { issues: GuardIssue[] }) {
  if (!issues.length) return <p className="text-xs text-muted-foreground">Accuracy check: every line traces back to your resume.</p>;
  const verb = { removed: "Removed", replaced_with_original: "Replaced with your original line", kept_original: "Kept your original" } as const;
  return (
    <Disclosure className="border-dashed" summary={<>The accuracy check changed {issues.length} line{issues.length === 1 ? "" : "s"}</>}>
      <ul className="grid gap-1.5">
        {issues.map((i, n) => (
          <li key={n} className="grid gap-0.5">
            <span className="text-muted-foreground">
              {verb[i.action]} ({i.where}): {i.reason}
            </span>
            <span className="line-through decoration-muted-foreground/60">{i.text}</span>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

/** The tailored resume, with each rewritten bullet shown beside the original it came from. */
export function ResumeDocEditor({ docId, initial, generated, edited, originals }: { docId: string; initial: TailoredResumeDoc; generated: TailoredResumeDoc; edited: boolean; originals: Record<string, string> }) {
  const [doc, setDoc] = useState(initial);
  const { pending, message, save, discard } = useSave(docId);

  const setBullet = (si: number, ei: number, bi: number, text: string | null) =>
    setDoc((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i !== si
          ? s
          : {
              ...s,
              entries: s.entries.map((e, j) =>
                j !== ei ? e : { ...e, bullets: text === null ? e.bullets.filter((_, k) => k !== bi) : e.bullets.map((b, k) => (k === bi ? { ...b, text } : b)) },
              ),
            },
      ),
    }));

  return (
    <div className="grid gap-4">
      <Toolbar docId={docId} edited={edited} pending={pending} message={message} onSave={() => save(doc)} onDiscard={() => discard(() => setDoc(generated))} />
      <div className="grid gap-1.5">
        <Label htmlFor={`${docId}-summary`}>Summary</Label>
        <Textarea id={`${docId}-summary`} rows={3} value={doc.summary ?? ""} onChange={(e) => setDoc({ ...doc, summary: e.target.value || null })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${docId}-skills`}>Skills (comma-separated, most relevant first)</Label>
        <Textarea
          id={`${docId}-skills`}
          rows={2}
          value={doc.skills.join(", ")}
          onChange={(e) => setDoc({ ...doc, skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 60) })}
        />
      </div>
      {doc.sections.map((s, si) => (
        <section key={s.key} className="grid gap-3">
          <h3 className="font-medium">{SECTION_HEADINGS[s.key]}</h3>
          {s.entries.map((e, ei) => (
            <div key={e.sourceId} className="grid gap-2 rounded-lg border bg-card p-3">
              <p className="text-sm">
                <span className="font-medium">{e.organization}</span>
                {e.title ? ` · ${e.title}` : ""}
                {e.start || e.end ? <span className="text-muted-foreground"> · {[e.start, e.end].filter(Boolean).join(" – ")}</span> : null}
              </p>
              {e.bullets.map((b, bi) => {
                const source = b.sourceBulletIds.map((id) => originals[id]).filter(Boolean).join(" / ");
                const changed = source && source !== b.text;
                return (
                  <div key={bi} className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="grid gap-1">
                      <Textarea aria-label={`Bullet ${bi + 1} for ${e.organization}`} rows={2} value={b.text} onChange={(ev) => setBullet(si, ei, bi, ev.target.value)} />
                      {changed ? (
                        <p className="text-xs text-muted-foreground">
                          <Badge variant="outline" className="mr-1">
                            Reworded
                          </Badge>
                          Original: {source}
                        </p>
                      ) : null}
                    </div>
                    <Button size="icon-sm" variant="ghost" aria-label="Remove bullet" title="Remove bullet" onClick={() => setBullet(si, ei, bi, null)}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function LetterDocEditor({ docId, initial, generated, edited }: { docId: string; initial: CoverLetterDoc; generated: CoverLetterDoc; edited: boolean }) {
  const [doc, setDoc] = useState(initial);
  const { pending, message, save, discard } = useSave(docId);
  return (
    <div className="grid gap-4">
      <Toolbar docId={docId} edited={edited} pending={pending} message={message} onSave={() => save(doc)} onDiscard={() => discard(() => setDoc(generated))} />
      <div className="grid gap-1.5">
        <Label htmlFor={`${docId}-greeting`}>Greeting</Label>
        <Input id={`${docId}-greeting`} value={doc.greeting} onChange={(e) => setDoc({ ...doc, greeting: e.target.value })} />
      </div>
      {doc.paragraphs.map((p, i) => (
        <div key={i} className="grid gap-1.5">
          <Label htmlFor={`${docId}-p${i}`}>Paragraph {i + 1}</Label>
          <Textarea id={`${docId}-p${i}`} rows={4} value={p} onChange={(e) => setDoc({ ...doc, paragraphs: doc.paragraphs.map((x, j) => (j === i ? e.target.value : x)) })} />
        </div>
      ))}
      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor={`${docId}-closing`}>Closing</Label>
        <Input id={`${docId}-closing`} value={doc.closing} onChange={(e) => setDoc({ ...doc, closing: e.target.value })} />
      </div>
    </div>
  );
}
