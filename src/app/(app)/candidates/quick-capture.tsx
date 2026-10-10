"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { classifyDiscipline, classifyUniversity } from "@/lib/classify";
import { DISCIPLINE_LABELS, SHORT_UNIVERSITY, type Discipline, type University } from "@/lib/domain";
import { captureFromHtml, captureFromText, type CapturedPerson } from "@/lib/imports/page-capture";
import { addCapturedPeople, findExistingProfiles } from "./actions";

type Row = CapturedPerson & {
  include: boolean;
  existing: boolean;
  university: University | null;
  discipline: Discipline | null;
};

/** "jane-doe-4a1b2" → "Jane Doe", only as an editable starting point when a paste had no names. */
function nameFromSlug(key: string) {
  return key
    .split("-")
    .filter((p) => !/\d/.test(p))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function QuickCapture({ countUbcoAsUbc, autoApprove }: { countUbcoAsUbc: boolean; autoApprove: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [approve, setApprove] = useState(true);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition(); // saving
  const [checking, startChecking] = useTransition(); // looking up who's already in the list
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const refocus = useRef(false);

  // After saving, put the cursor back in the paste box so the next page is one Ctrl+V away.
  useEffect(() => {
    if (rows === null && refocus.current) {
      refocus.current = false;
      pasteRef.current?.focus();
    }
  }, [rows]);

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setMessage(null);
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    let people = html ? captureFromHtml(html, new DOMParser()) : [];
    if (people.length === 0) people = captureFromText(text);
    if (people.length === 0) {
      setMessage({ kind: "error", text: "No LinkedIn profiles found. On a LinkedIn search results page, press Ctrl+A then Ctrl+C, and paste here." });
      return;
    }
    const prepared: Row[] = people.map((p) => {
      const context = [p.headline, ...p.details].filter(Boolean).join(" · ");
      const uni = classifyUniversity(context, { countUbcoAsUbc });
      // The program comes from the headline only: "Past:" lines can mention other fields.
      const disc = classifyDiscipline(p.headline, uni.value);
      const university = uni.confidence === "confirmed" ? uni.value : null;
      const discipline = disc.confidence === "confirmed" ? disc.value : null;
      return {
        ...p,
        name: p.name || nameFromSlug(p.key),
        // Only people with a recognised school and program are added; existing
        // connections can't be invited again, so they're left out too.
        include: !p.alreadyConnected && university !== null && discipline !== null,
        existing: false,
        university,
        discipline,
      };
    });
    setRows(prepared);
    startChecking(async () => {
      const existing = new Set(await findExistingProfiles(prepared.map((r) => r.key)));
      setRows((cur) => cur?.map((r) => (existing.has(r.key) ? { ...r, existing: true, include: false } : r)) ?? null);
    });
  };

  const addable = (r: Row) => !r.existing && !r.alreadyConnected && r.university !== null && r.discipline !== null;
  const update = (key: string, patch: Partial<Row>) =>
    setRows(
      (cur) =>
        cur?.map((r) => {
          if (r.key !== key) return r;
          const next = { ...r, ...patch };
          // Setting school or program includes the row once both are known; clearing one excludes it.
          return "university" in patch || "discipline" in patch ? { ...next, include: addable(next) } : next;
        }) ?? null,
    );
  const fillBlank = (field: "university" | "discipline", value: string) => {
    if (!value) return;
    setRows(
      (cur) =>
        cur?.map((r) => {
          if (r.existing || r.alreadyConnected || r[field] !== null) return r;
          const next = { ...r, [field]: value };
          return { ...next, include: addable(next) };
        }) ?? null,
    );
  };
  const missing = (r: Row) =>
    r.university === null && r.discipline === null ? "Needs school and program" : r.university === null ? "Needs school" : r.discipline === null ? "Needs program" : null;

  const selected = rows?.filter((r) => r.include && addable(r)) ?? [];
  const incomplete = rows?.filter((r) => !r.existing && !r.alreadyConnected && missing(r)).length ?? 0;

  const save = () =>
    startTransition(async () => {
      const result = await addCapturedPeople(
        selected.map((r) => ({
          url: r.url,
          name: r.name,
          headline: r.headline,
          details: r.details.join(" · ") || null,
          // `selected` only holds rows where both are set (see addable).
          university: r.university!,
          discipline: r.discipline!,
        })),
        approve,
      );
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      const review = result.added - result.approved;
      setMessage({
        kind: "ok",
        text: `Added ${result.added}${result.approved ? ` (${result.approved} approved` : " ("}${review ? `${result.approved ? ", " : ""}${review} for review` : ""}). Paste the next page.`,
      });
      refocus.current = true;
      setRows(null);
    });

  return (
    <div className="grid gap-3">
      {rows === null ? (
        <>
          <textarea
            ref={pasteRef}
            onPaste={onPaste}
            onChange={() => {}}
            value=""
            rows={3}
            aria-label="Paste a LinkedIn search results page here"
            placeholder="On a LinkedIn people-search page: Ctrl+A, Ctrl+C. Then click here and press Ctrl+V."
            className="w-full rounded-lg border border-dashed border-input bg-transparent px-3 py-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="text-xs text-muted-foreground">
            Only what you copied is read. Nothing is fetched from LinkedIn. Tip: use LinkedIn&apos;s School filter with a
            program keyword, then paste each results page.
          </p>
        </>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <p className="mr-auto">
              <strong>{rows.length}</strong> found · {rows.filter((r) => r.alreadyConnected).length} already connected ·{" "}
              {rows.filter((r) => r.existing).length} already in your list ·{" "}
              {checking ? "checking your list…" : `${selected.length} ready to add · ${incomplete} missing school or program`}
            </p>
            <label className="grid gap-1 text-xs">
              School for rows without one
              <NativeSelect className="w-40" defaultValue="" onChange={(e) => fillBlank("university", e.target.value)}>
                <option value="">—</option>
                {Object.entries(SHORT_UNIVERSITY).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-xs">
              Program for rows without one
              <NativeSelect className="w-48" defaultValue="" onChange={(e) => fillBlank("discipline", e.target.value)}>
                <option value="">—</option>
                {Object.entries(DISCIPLINE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>

          <ul className="grid gap-2">
            {rows.map((r) => (
              <li key={r.key} className={`grid gap-2 rounded-lg border p-2 sm:grid-cols-[auto_1fr_8rem_12rem] sm:items-center ${r.existing || r.alreadyConnected ? "opacity-50" : ""}`}>
                <input
                  type="checkbox"
                  aria-label={`Include ${r.name}`}
                  checked={r.include}
                  disabled={!addable(r)}
                  onChange={(e) => update(r.key, { include: e.target.checked })}
                  className="size-4 accent-primary"
                />
                <div className="grid min-w-0 gap-0.5">
                  <Input aria-label="Name" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} className="h-7" />
                  <p className="truncate text-xs text-muted-foreground" title={r.headline ?? ""}>
                    {r.alreadyConnected ? (
                      <Badge variant="outline">Already connected</Badge>
                    ) : r.existing ? (
                      <Badge variant="outline">Already in your list</Badge>
                    ) : missing(r) ? (
                      <Badge variant="outline">{missing(r)}</Badge>
                    ) : null}{" "}
                    {r.headline ?? "No headline"}
                  </p>
                </div>
                <NativeSelect aria-label={`School for ${r.name}`} value={r.university ?? ""} onChange={(e) => update(r.key, { university: (e.target.value || null) as University | null })}>
                  <option value="">School?</option>
                  {Object.entries(SHORT_UNIVERSITY).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect aria-label={`Program for ${r.name}`} value={r.discipline ?? ""} onChange={(e) => update(r.key, { discipline: (e.target.value || null) as Discipline | null })}>
                  <option value="">Program?</option>
                  {Object.entries(DISCIPLINE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={pending || checking || selected.length === 0}>
              {pending ? "Saving…" : `Add ${selected.length} ${selected.length === 1 ? "person" : "people"}`}
            </Button>
            {autoApprove ? (
              <p className="text-sm text-muted-foreground">Auto-approve is on: rows with school and program set are approved.</p>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} className="size-4 accent-primary" />
                Approve the ones with school and program set
              </label>
            )}
            <Button variant="ghost" onClick={() => setRows(null)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Only people with both a school and a program are added. To include someone else, set theirs above.
          </p>
        </div>
      )}
      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-destructive" : "text-sm"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
