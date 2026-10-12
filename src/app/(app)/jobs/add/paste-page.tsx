"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countryName } from "@/lib/geo/countries";
import { parsePastedPage, type PastedPosting } from "@/lib/job-postings/paste-parse";
import { PROVINCE_CODES } from "@/lib/job-postings/types";
import { readPastedPostingWithAI } from "../actions";

/** Sets a field of the posting form below, if it exists and there's a value. */
function setField(id: string, value: string | null | undefined): boolean {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (!el || !value) return false;
  el.value = value;
  return true;
}

/** Fills the form with what was found; returns the names of the fields it filled. */
function fill(p: Partial<PastedPosting>): string[] {
  const filled: string[] = [];
  if (setField("title", p.title)) filled.push("job title");
  if (setField("company", p.company)) filled.push("company");
  if (setField("city", p.city)) filled.push("city");
  if (p.country && setField("country", p.country)) filled.push(countryName(p.country) ?? "country");
  if (p.country === "CA" && p.region && (PROVINCE_CODES as readonly string[]).includes(p.region)) setField("province", p.region);
  if (setField("description", p.description)) filled.push("posting text");
  return filled;
}

/**
 * Paste a whole job page (Ctrl+A, Ctrl+C on LinkedIn, Indeed, Glassdoor, a careers page…)
 * and the form below is filled from it. Only what's pasted is read, here in the browser;
 * the page itself is never fetched. "Read with AI" asks the AI for the same fields and
 * keeps only values found in the paste.
 */
export function PastePage({ aiAvailable }: { aiAvailable: boolean }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const fillFromRules = (page: string) => {
    const filled = fill(parsePastedPage(page));
    setStatus(
      filled.length
        ? { kind: "ok", text: `Filled ${filled.join(", ")} from the page. Check every field, and paste the link to the posting.` }
        : { kind: "error", text: "Couldn't find the job's details in that text. Fill in the form yourself." },
    );
  };

  const readWithAi = () => {
    fillFromRules(text);
    startTransition(async () => {
      const r = await readPastedPostingWithAI(text);
      if (!r.ok) {
        setStatus({ kind: "error", text: r.error });
        return;
      }
      const filled = r.data ? fill(r.data) : [];
      setStatus({ kind: "ok", text: filled.length ? `AI filled ${filled.join(", ")} (only words that are on the page). Check every field before adding.` : "AI found nothing more than the page reader. Check the form before adding." });
    });
  };

  return (
    <div className="grid gap-2 rounded-lg border border-dashed p-3">
      <Label htmlFor="paste-page">Quick fill: paste the whole job page (optional)</Label>
      <Textarea
        id="paste-page"
        rows={4}
        value={text}
        placeholder="On the job's page, press Ctrl+A then Ctrl+C, and paste here."
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text/plain");
          if (pasted) setTimeout(() => fillFromRules(pasted), 0);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!text.trim()} onClick={() => fillFromRules(text)}>
          Fill the form
        </Button>
        {aiAvailable ? (
          <Button type="button" size="sm" variant="outline" disabled={!text.trim() || pending} onClick={readWithAi}>
            {pending ? "Reading…" : "Read with AI"}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">Read here in your browser from what you paste.</p>
      </div>
      {status ? (
        <p role="status" className={status.kind === "ok" ? "text-sm text-success" : "text-sm text-destructive"}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
