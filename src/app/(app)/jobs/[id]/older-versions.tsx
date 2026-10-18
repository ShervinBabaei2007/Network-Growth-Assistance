"use client";

import { Disclosure } from "@/components/disclosure";
import { Download, Trash2 } from "lucide-react";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button, buttonVariants } from "@/components/ui/button";
import { deleteDocument, restoreDocument } from "../documents/actions";

/** Earlier generated versions for this job: each can still be downloaded, or deleted (with Undo). */
export function OlderVersions({ versions }: { versions: { id: string; label: string; detail: string }[] }) {
  const { pending, run } = useActionRunner();
  return (
    <Disclosure summary={<>{versions.length} earlier version{versions.length === 1 ? "" : "s"}</>}>
      <ul className="grid gap-2">
        {versions.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {v.label} <span className="text-muted-foreground">· {v.detail}</span>
            </span>
            <span className="flex flex-wrap gap-1">
              <a href={`/api/jobs/documents/${v.id}/download?format=pdf`} className={buttonVariants({ size: "xs", variant: "ghost" })}>
                <Download aria-hidden /> PDF
              </a>
              <a href={`/api/jobs/documents/${v.id}/download?format=docx`} className={buttonVariants({ size: "xs", variant: "ghost" })}>
                <Download aria-hidden /> Word
              </a>
              <Button size="xs" variant="ghost" disabled={pending} aria-label={`Delete ${v.label}`} title={`Delete ${v.label}`} onClick={() => run(() => deleteDocument(v.id), { undo: () => restoreDocument(v.id) })}>
                <Trash2 aria-hidden /> Delete
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
