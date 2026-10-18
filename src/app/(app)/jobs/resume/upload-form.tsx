"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Upload } from "lucide-react";
import type { ResumeImportResponse } from "@/app/api/jobs/resume/route";
import { notify, toast } from "@/components/toast/notify";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { MAX_TRACK_NAME, normalizeTrack } from "@/lib/job-postings/tracks";
import { plural } from "@/lib/toast";

const MAX_BYTES = 4 * 1024 * 1024;
const UNREADABLE = "We couldn't read this resume. Try another PDF or DOCX file.";

/** Specific "not found" messages for the fields people most often need to add themselves. */
const MISSING_TOASTS: Record<string, string> = {
  "contact.linkedin": "We couldn't find a LinkedIn profile in your resume. You can add it manually.",
  email: "We couldn't find an email address in your resume. Please enter it manually.",
};

/**
 * Imports a resume from a PDF or Word file, or pasted text. The server keeps the original
 * unchanged and makes a new profile from it; what needs checking is marked on the page.
 */
export function ResumeUpload({ hasResume, aiNote, track }: { hasResume: boolean; aiNote: { available: boolean; text: string }; track: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [text, setText] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [trackName, setTrackName] = useState(track ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const announce = (r: ResumeImportResponse) => {
    const filled = `We filled ${plural(r.filled, "profile field")}.`;
    if (r.needsReview.length) notify({ type: "warning", title: `Resume imported, but ${plural(r.needsReview.length, "field")} ${r.needsReview.length === 1 ? "needs" : "need"} verification.`, description: filled, key: "resume-import" });
    else notify({ type: "success", title: `Resume imported successfully. ${filled}`, key: "resume-import" });
    let shown = 0;
    for (const m of r.missing) {
      if (shown >= 2) break;
      const message = MISSING_TOASTS[m.path] ?? (m.path.endsWith(".graduation") ? "We couldn't identify your graduation date. Please enter it manually." : null);
      if (message) {
        toast.info(message, undefined, { key: `resume-missing-${m.path}` });
        shown++;
      }
    }
    for (const w of r.warnings) toast.warning(w);
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const body = new FormData();
    if (mode === "file") {
      const file = input.current?.files?.[0];
      if (!file) return setError("Choose a PDF or DOCX file first.");
      if (file.size > MAX_BYTES) return setError("Keep the file under 4 MB.");
      body.set("file", file);
    } else {
      if (text.trim().length < 100) return setError("Paste your whole resume (it looks too short).");
      body.set("text", text);
    }
    if (useAi) body.set("useAi", "on");
    body.set("track", trackName);
    start(async () => {
      toast.progress("Reading your resume…", "resume-import");
      try {
        const res = await fetch("/api/jobs/resume", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as Partial<ResumeImportResponse> & { error?: string };
        if (!res.ok || !json.id) {
          const message = json.error ?? UNREADABLE;
          setError(message);
          notify({ type: "error", title: message, key: "resume-import" });
          return;
        }
        announce(json as ResumeImportResponse);
        if (input.current) input.current.value = "";
        setText("");
        const imported = normalizeTrack(trackName);
        router.push(`/jobs/resume?${imported ? `track=${encodeURIComponent(imported)}&` : ""}imported=${json.id}#import-summary`);
        router.refresh();
      } catch {
        const message = "Couldn't reach the server. Check your connection and try again. Your resume wasn't changed.";
        setError(message);
        notify({ type: "error", title: message, key: "resume-import" });
      }
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-3" aria-label="Import resume">
      <div role="tablist" aria-label="How to import" className="inline-flex w-fit rounded-lg border bg-muted p-0.5 text-sm">
        {(
          [
            ["file", "Upload a file", Upload],
            ["paste", "Paste text", ClipboardPaste],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${mode === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon aria-hidden className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="resumeFile">{hasResume ? "A new version (PDF or Word)" : "Your resume (PDF or Word)"}</Label>
          <input
            ref={input}
            id="resumeFile"
            name="file"
            type="file"
            accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
            className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:hover:bg-muted"
          />
          <p className="text-xs text-muted-foreground">PDF or DOCX under 4 MB, with selectable text (not a scan). The original file is kept privately in your account so you can download it again.</p>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="resumeText">Your resume, as text</Label>
          <Textarea id="resumeText" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole resume, from your name to the last section." />
          <p className="text-xs text-muted-foreground">Keep the section headings (Experience, Education, Skills…) so each part is read correctly.</p>
        </div>
      )}

      <div className="grid max-w-sm gap-1.5">
        <Label htmlFor="resumeTrack">Track (optional)</Label>
        <Input id="resumeTrack" value={trackName} maxLength={MAX_TRACK_NAME} onChange={(e) => setTrackName(e.target.value)} placeholder="Main resume" />
        <p className="text-xs text-muted-foreground">Keep a separate base resume for each kind of role, such as Software or Data, and pick one per job. Leave it empty for your main resume.</p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={useAi} disabled={!aiNote.available} onCheckedChange={setUseAi} className="mt-0.5" />
        <span>
          Also read it with AI for a second opinion <span className="text-muted-foreground">({aiNote.text})</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Upload aria-hidden /> {pending ? "Reading…" : hasResume ? "Import new version" : "Import resume"}
        </Button>
        <p className="text-xs text-muted-foreground">Importing never changes an earlier resume; each import is kept as its own version.</p>
      </div>
      {error ? (
        <p className="text-sm text-destructive" data-testid="import-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
