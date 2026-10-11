"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Sends the PDF to the server, which reads its text and discards the file. */
export function ResumeUpload({ hasResume }: { hasResume: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return setStatus({ ok: false, text: "Choose a PDF first." });
    if (file.size > 4 * 1024 * 1024) return setStatus({ ok: false, text: "Keep the PDF under 4 MB." });
    start(async () => {
      setStatus({ ok: true, text: "Reading your resume…" });
      const body = new FormData();
      body.set("file", file);
      try {
        const res = await fetch("/api/jobs/resume", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { error?: string; note?: string | null };
        if (!res.ok) return setStatus({ ok: false, text: json.error ?? "Couldn't read that resume. Try again." });
        setStatus({ ok: true, text: json.note ?? "Done. Check the sections below and fix anything that was read wrong." });
        if (input.current) input.current.value = "";
        router.refresh();
      } catch {
        setStatus({ ok: false, text: "Couldn't reach the server. Check your connection and try again." });
      }
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-3" aria-label="Upload resume">
      <div className="grid gap-1.5">
        <Label htmlFor="resumeFile">{hasResume ? "Upload a new version (PDF)" : "Your resume (PDF)"}</Label>
        <input
          ref={input}
          id="resumeFile"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:hover:bg-muted"
        />
        <p className="text-xs text-muted-foreground">Under 4 MB, with selectable text (exported from Word or Google Docs, not a scan). The file isn&apos;t kept, only its text.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Upload aria-hidden /> {pending ? "Reading…" : "Upload"}
        </Button>
        {status ? (
          <p role={status.ok ? "status" : "alert"} className={status.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
            {status.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
