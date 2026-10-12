"use client";

import { useId, useState } from "react";
import { markApplied } from "@/app/(app)/applications/actions";
import { setJobStatus } from "@/app/(app)/jobs/actions";
import { NativeSelect } from "@/components/native-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Today's date on this device, for the date field's default. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A verified Apply link. Opening it never counts as applying: afterwards the user is asked
 * "Mark as applied?" and only a confirmation (with the date, and optionally the document
 * version they sent) records it.
 */
export function ApplyLink({
  jobId,
  href,
  status,
  className,
  children,
  documents = [],
  panelClassName,
}: {
  jobId: string;
  href: string;
  status: "saved" | "applied" | "dismissed" | null;
  className?: string;
  children: React.ReactNode;
  documents?: { value: string; label: string }[];
  panelClassName?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [date, setDate] = useState("");
  const [doc, setDoc] = useState("");
  const { pending, run } = useActionRunner();
  const id = useId();

  const confirm = () => {
    const [kind, docId] = doc.split(":");
    const document = docId ? (kind === "t" ? { tailoredId: docId } : { resumeId: docId }) : null;
    run(
      async () => {
        const r = await markApplied(jobId, date || today(), document);
        if (r.ok) setAsking(false);
        return r;
      },
      { undo: () => setJobStatus(jobId, status === "dismissed" ? "dismissed" : status) },
    );
  };

  return (
    <span className="relative inline-flex">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={() => {
          if (status === "applied") return;
          setDate(today());
          setAsking(true);
        }}
      >
        {children}
      </a>
      {asking ? (
        <div role="dialog" aria-labelledby={`${id}-title`} className={cn("absolute right-0 top-full z-30 mt-2 grid w-72 gap-3 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg", panelClassName)}>
          <p id={`${id}-title`} className="font-medium">
            Mark as applied?
          </p>
          <p className="text-xs text-muted-foreground">Only if you finished the application on their site. Opening the link alone doesn&apos;t count.</p>
          <div className="grid gap-1">
            <Label htmlFor={`${id}-date`}>Date applied</Label>
            <Input id={`${id}-date`} type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </div>
          {documents.length ? (
            <div className="grid gap-1">
              <Label htmlFor={`${id}-doc`}>Document you sent (optional)</Label>
              <NativeSelect id={`${id}-doc`} value={doc} onChange={(e) => setDoc(e.target.value)}>
                <option value="">Not recorded</option>
                {documents.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !date} onClick={confirm}>
              Mark as applied
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              Not yet
            </Button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
