"use client";

import { useStateToast } from "@/components/toast/use-state-toast";
import { useActionState, useRef, useState } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONNECTION_FIELDS, FIELD_LABELS, type ColumnMapping } from "@/lib/connections/csv";
import { importConnections, type ConnectionImportState } from "./actions";

/** Upload → preview and column mapping → confirm. Nothing is saved until "Import". */
export function ConnectionsImport() {
  const [state, action, pending] = useActionState<ConnectionImportState, FormData>(importConnections, { status: "idle" });
  useStateToast(state);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [fileChosen, setFileChosen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const effective = mapping ?? state.mapping ?? null;
  const c = state.counts;

  return (
    <form
      ref={formRef}
      action={action}
      // Keep the chosen file between the preview and the import.
      onReset={(e) => e.preventDefault()}
      className="grid gap-4"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="connectionsCsv">Connections CSV</Label>
        <Input
          id="connectionsCsv"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          onChange={() => {
            setMapping(null);
            setFileChosen(true);
          }}
        />
        <p className="text-xs text-muted-foreground">
          LinkedIn&apos;s Connections.csv works as is. Any contact list with a name column also works. The file is read once and not kept; email
          addresses are never saved.
        </p>
      </div>

      {state.header?.length && effective ? (
        <fieldset className="grid gap-3 rounded-lg border bg-card p-3">
          <legend className="px-1 text-sm font-medium">Columns{state.isLinkedInExport ? " (LinkedIn export recognized)" : ""}</legend>
          <input type="hidden" name="customMapping" value={mapping ? "1" : "0"} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CONNECTION_FIELDS.map((f) => (
              <div key={f} className="grid gap-1.5">
                <Label htmlFor={`map_${f}`}>{FIELD_LABELS[f]}</Label>
                <NativeSelect
                  id={`map_${f}`}
                  name={`map_${f}`}
                  value={String(effective[f])}
                  onChange={(e) => setMapping({ ...effective, [f]: Number(e.target.value) })}
                >
                  <option value="-1">Not in file</option>
                  {state.header!.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </div>
          {state.sample?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">First rows of the file</caption>
                <thead>
                  <tr>
                    {state.header!.map((h, i) => (
                      <th key={i} scope="col" className="border-b px-2 py-1 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.sample.map((r, i) => (
                    <tr key={i}>
                      {state.header!.map((_, j) => (
                        <td key={j} className="max-w-40 truncate border-b px-2 py-1 text-muted-foreground">
                          {r[j]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {c && state.status !== "error" ? (
        <ul className="grid gap-1 rounded-lg border bg-card p-3 text-sm" aria-live="polite">
          <li>{c.rows.toLocaleString("en-CA")} people in the file</li>
          <li>{c.add.toLocaleString("en-CA")} new known connection(s) to add</li>
          <li>{c.update.toLocaleString("en-CA")} existing record(s) to update with new details</li>
          <li>{c.unchanged.toLocaleString("en-CA")} already saved, unchanged</li>
          {c.duplicatesInFile ? <li>{c.duplicatesInFile} duplicate row(s) in the file skipped</li> : null}
          {c.skipped ? <li>{c.skipped} row(s) without a name skipped</li> : null}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="mode" value="preview" variant="outline" disabled={pending || !fileChosen}>
          {pending ? "Reading…" : state.status === "preview" && mapping ? "Update preview" : "Preview"}
        </Button>
        {state.status === "preview" ? (
          <Button type="submit" name="mode" value="import" disabled={pending || (c ? c.add + c.update === 0 : true)}>
            {pending ? "Importing…" : "Import"}
          </Button>
        ) : null}
        {state.status === "error" ? (
          <p className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
        {state.status === "imported" ? (
          <p className="text-sm text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
