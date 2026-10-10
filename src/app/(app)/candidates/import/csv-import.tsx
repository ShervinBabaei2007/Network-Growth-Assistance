"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DISCIPLINE_LABELS, SHORT_UNIVERSITY } from "@/lib/domain";
import { CANDIDATE_FIELDS, type CandidateField } from "@/lib/imports/candidates-csv";
import { importCandidatesCsv, type CsvPreview } from "../actions";

export function CsvImport() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [state, action, pending] = useActionState<CsvPreview, FormData>(importCandidatesCsv, { status: "idle" });
  const showMapping = state.headers && state.status !== "imported";

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="file">CSV file</Label>
        <Input
          id="file"
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setFileName(file?.name ?? "");
            setCsv(file ? await file.text() : "");
          }}
        />
        <p className="text-xs text-muted-foreground">
          Needs a header row with at least a name and a LinkedIn profile URL. Up to 5,000 rows and 2 MB.
        </p>
      </div>
      <input type="hidden" name="csv" value={csv} />

      {showMapping ? (
        <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="px-1 text-sm font-medium">Columns in {fileName || "your file"}</legend>
          <input type="hidden" name="mapped" value="1" />
          {(Object.keys(CANDIDATE_FIELDS) as CandidateField[]).map((field) => (
            <div key={field} className="grid gap-1.5">
              <Label htmlFor={`map-${field}`}>{CANDIDATE_FIELDS[field]}</Label>
              <NativeSelect id={`map-${field}`} name={`map.${field}`} defaultValue={state.mapping?.[field]?.toString() ?? ""} key={`${field}-${state.mapping?.[field]}`}>
                <option value="">Not in file</option>
                {state.headers!.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
        </fieldset>
      ) : null}

      {state.status === "preview" || state.status === "imported" || (state.status === "error" && state.totalRows !== undefined) ? (
        <div className="grid gap-3 rounded-lg border p-3 text-sm" aria-live="polite">
          <p>
            {state.totalRows} rows · <strong>{state.newRows} new</strong> · {state.duplicates} already in your list ·{" "}
            {state.issues?.length ?? 0} skipped · {state.needsReview} of the new ones need review
          </p>
          {state.sample && state.sample.length > 0 && state.status === "preview" ? (
            <ul className="grid gap-1">
              {state.sample.map((s) => (
                <li key={s.profile_key} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{s.full_name}</span>
                  <span className="text-muted-foreground">
                    {s.university ? SHORT_UNIVERSITY[s.university] : "?"} · {s.discipline ? DISCIPLINE_LABELS[s.discipline] : "?"} —{" "}
                    {s.classificationNote}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {state.issues && state.issues.length > 0 ? (
            <details>
              <summary className="cursor-pointer">Skipped rows</summary>
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                {state.issues.map((i) => (
                  <li key={`${i.line}-${i.reason}`}>
                    {i.line ? `Line ${i.line}: ` : ""}
                    {i.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {state.status === "preview" && (state.newRows ?? 0) > 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="approveConfirmed" className="size-4 accent-primary" />
          Approve rows whose school and program are recognized (others go to review)
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="mode" value="preview" variant={state.status === "preview" ? "outline" : "default"} disabled={!csv || pending}>
          {pending ? "Checking…" : state.headers ? "Preview again" : "Preview"}
        </Button>
        {state.status === "preview" && (state.newRows ?? 0) > 0 ? (
          <Button type="submit" name="mode" value="import" disabled={pending}>
            Import {state.newRows} candidate{state.newRows === 1 ? "" : "s"}
          </Button>
        ) : null}
        {state.status === "imported" ? (
          <p role="status" className="text-sm">
            {state.message}{" "}
            <Link href="/candidates?review=1" className="underline underline-offset-4">
              Review them
            </Link>
          </p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
