"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, GitCompare, RotateCcw, Trash2 } from "lucide-react";
import { NativeSelect } from "@/components/native-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { diffLines, diffStats } from "@/lib/text/diff";
import { cn } from "@/lib/utils";
import { deleteDocument, restoreDocument } from "../documents/actions";
import { restoreOriginalProfile, undoRestoreProfile } from "./actions";

export type Version = {
  key: string;
  label: string;
  kind: "original" | "parsed" | "current" | "tailored";
  detail: string;
  text: string;
  /** For generated versions: the document id and its job. */
  docId?: string;
  href?: string;
  download?: string;
};

/**
 * Every version of the resume, side by side: the original (never changed), the profile as
 * first parsed, the working profile, and each tailored resume or CV. Generated versions
 * can be deleted (with Undo); the original can't, and can always be restored.
 */
export function ResumeVersions({ resumeId, versions, canRestore }: { resumeId: string; versions: Version[]; canRestore: boolean }) {
  const [left, setLeft] = useState(versions.find((v) => v.kind === "original")?.key ?? versions[0]?.key ?? "");
  const [right, setRight] = useState(versions.find((v) => v.kind === "tailored")?.key ?? versions.find((v) => v.kind === "current")?.key ?? "");
  const [comparing, setComparing] = useState(false);
  const { pending, run } = useActionRunner();
  const a = versions.find((v) => v.key === left);
  const b = versions.find((v) => v.key === right);
  const ops = useMemo(() => (comparing && a && b ? diffLines(a.text, b.text) : []), [comparing, a, b]);
  const stats = diffStats(ops);

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        {versions.map((v) => (
          <li key={v.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
            <div className="grid gap-0.5">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {v.label}
                {v.kind === "original" ? <Badge variant="secondary">Never changed</Badge> : null}
              </span>
              <span className="text-xs text-muted-foreground">{v.detail}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {v.download ? (
                <a href={v.download} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                  <Download aria-hidden /> Download
                </a>
              ) : null}
              {v.href ? (
                <Link href={v.href} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                  Open and edit
                </Link>
              ) : null}
              {v.kind === "current" && canRestore ? (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => restoreOriginalProfile(resumeId), { progress: "Restoring…", undo: () => undoRestoreProfile(resumeId) })}>
                  <RotateCcw aria-hidden /> Restore original
                </Button>
              ) : null}
              {v.docId ? (
                <Button size="sm" variant="ghost" disabled={pending} aria-label={`Delete ${v.label}`} onClick={() => run(() => deleteDocument(v.docId!), { undo: () => restoreDocument(v.docId!) })}>
                  <Trash2 aria-hidden /> Delete
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 rounded-lg border p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="grid gap-1">
            <Label htmlFor="compare-left">Compare</Label>
            <NativeSelect id="compare-left" value={left} onChange={(e) => setLeft(e.target.value)}>
              {versions.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="compare-right">with</Label>
            <NativeSelect id="compare-right" value={right} onChange={(e) => setRight(e.target.value)}>
              {versions.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button variant="outline" onClick={() => setComparing(true)} disabled={!a || !b || left === right}>
            <GitCompare aria-hidden /> Compare
          </Button>
        </div>
        {comparing && a && b ? (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground" role="status">
              {stats.added || stats.removed ? `${stats.removed} line${stats.removed === 1 ? "" : "s"} only in “${a.label}”, ${stats.added} only in “${b.label}”.` : "These two versions have the same text."}
            </p>
            <ol className="max-h-[32rem] overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs leading-relaxed" aria-label="Differences">
              {ops.map((o, i) => (
                <li
                  key={i}
                  className={cn("px-1.5 whitespace-pre-wrap", o.type === "add" && "bg-success-soft text-foreground", o.type === "del" && "bg-danger-soft text-foreground line-through decoration-destructive/40")}
                >
                  <span className="sr-only">{o.type === "add" ? "Only in the second: " : o.type === "del" ? "Only in the first: " : ""}</span>
                  <span aria-hidden className="mr-1.5 inline-block w-2 text-muted-foreground">
                    {o.type === "add" ? "+" : o.type === "del" ? "−" : ""}
                  </span>
                  {o.text || " "}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}
