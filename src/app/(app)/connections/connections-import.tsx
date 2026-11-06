"use client";

import { useStateToast } from "@/components/toast/use-state-toast";
import { useActionState, useRef, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONNECTION_FIELDS, FIELD_LABELS, type ColumnMapping } from "@/lib/connections/csv";
import { useLocale, useTr } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import { importConnections, type ConnectionImportState } from "./actions";

/** Upload → preview and column mapping → confirm. Nothing is saved until "Import". */
export function ConnectionsImport() {
  const [state, action, pending] = useActionState<ConnectionImportState, FormData>(importConnections, { status: "idle" });
  useStateToast(state);
  const tr = useTr();
  const locale = useLocale();
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
        <Label htmlFor="connectionsCsv">{tr("connectionsPage.csvLabel", "Connections CSV")}</Label>
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
          {tr("connectionsPage.csvHelp", "LinkedIn's Connections.csv works as is. Any contact list with a name column also works. The file is read once and not kept; email addresses are never saved.")}
        </p>
      </div>

      {state.header?.length && effective ? (
        <fieldset className="grid gap-3 rounded-lg border bg-card p-3">
          <legend className="px-1 text-sm font-medium">{state.isLinkedInExport ? tr("connectionsPage.columnsRecognized", "Columns (LinkedIn export recognized)") : tr("connectionsPage.columns", "Columns")}</legend>
          <input type="hidden" name="customMapping" value={mapping ? "1" : "0"} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CONNECTION_FIELDS.map((f) => (
              <div key={f} className="grid gap-1.5">
                <Label htmlFor={`map_${f}`}>{tr(`connectionsPage.${f === "email" ? "emailNotStored" : f}` as MessageKey, FIELD_LABELS[f])}</Label>
                <AppSelect
                  id={`map_${f}`}
                  name={`map_${f}`}
                  value={String(effective[f])}
                  onChange={(e) => setMapping({ ...effective, [f]: Number(e.target.value) })}
                >
                  <option value="-1">{tr("connectionsPage.notInFile", "Not in file")}</option>
                  {state.header!.map((h, i) => (
                    <option key={i} value={i}>
                      {h || tr("connectionsPage.columnN", "Column {n}", { n: i + 1 })}
                    </option>
                  ))}
                </AppSelect>
              </div>
            ))}
          </div>
          {state.sample?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">{tr("connectionsPage.firstRows", "First rows of the file")}</caption>
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
          <li>{tr("connectionsPage.peopleInFile", "{count} people in the file", { count: c.rows.toLocaleString(locale) })}</li>
          <li>{tr("connectionsPage.toAdd", "{count} new known connection(s) to add", { count: c.add.toLocaleString(locale) })}</li>
          <li>{tr("connectionsPage.toUpdate", "{count} existing record(s) to update with new details", { count: c.update.toLocaleString(locale) })}</li>
          <li>{tr("connectionsPage.unchanged", "{count} already saved, unchanged", { count: c.unchanged.toLocaleString(locale) })}</li>
          {c.duplicatesInFile ? <li>{tr("connectionsPage.duplicates", "{count} duplicate row(s) in the file skipped", { count: c.duplicatesInFile })}</li> : null}
          {c.skipped ? <li>{tr("connectionsPage.noName", "{count} row(s) without a name skipped", { count: c.skipped })}</li> : null}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="mode" value="preview" variant="outline" disabled={pending || !fileChosen}>
          {pending ? tr("connectionsPage.reading", "Reading…") : state.status === "preview" && mapping ? tr("connectionsPage.updatePreview", "Update preview") : tr("connectionsPage.preview", "Preview")}
        </Button>
        {state.status === "preview" ? (
          <Button type="submit" name="mode" value="import" disabled={pending || (c ? c.add + c.update === 0 : true)}>
            {pending ? tr("connectionsPage.importing", "Importing…") : tr("connectionsPage.import", "Import")}
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
