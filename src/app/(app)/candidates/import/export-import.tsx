"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importLinkedInExport, type ExportState } from "./export-actions";

export function ExportImport({ today }: { today: string }) {
  const [state, action, pending] = useActionState<ExportState, FormData>(importLinkedInExport, { status: "idle" });
  const s = state.summary;

  return (
    // The chosen files must survive Preview so Apply can send them again, so block
    // React's automatic form reset after an action.
    <form action={action} onReset={(e) => e.preventDefault()} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="connectionsFile">Connections.csv</Label>
          <Input id="connectionsFile" name="connections" type="file" accept=".csv,text/csv" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="invitationsFile">Invitations.csv</Label>
          <Input id="invitationsFile" name="invitations" type="file" accept=".csv,text/csv" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exportDate">Export downloaded on</Label>
          <Input id="exportDate" name="exportDate" type="date" max={today} defaultValue={today} required />
        </div>
      </div>

      {s ? (
        <ul className="grid gap-1 rounded-lg border p-3 text-sm" aria-live="polite">
          {s.totalConnections !== null ? <li>Network total: {s.totalConnections.toLocaleString("en-CA")} connections (recorded as a snapshot)</li> : null}
          {s.knownConnectionsToSave > 0 ? <li>{s.knownConnectionsToSave.toLocaleString("en-CA")} known connection(s) to add or update, so Discover skips people you already know</li> : null}
          <li>{s.invitationsToRecord} sent invitation(s) to record for people already in your list</li>
          <li>{s.acceptancesToRecord} pending invitation(s) LinkedIn now shows as connections → accepted</li>
          <li>
            {s.connectedNew} candidate(s) connected since your start date without a logged invitation; {s.connectedPreexisting} were already
            connections before it (not counted)
          </li>
          <li>
            {s.newFromTargetSchools} new connection(s) since the start at a target school who aren&apos;t candidates yet; {s.newOther} other
            new connections count only toward your network total
          </li>
          {s.pendingMissingFromExport > 0 ? (
            <li>
              {s.pendingMissingFromExport} invitation(s) pending here are no longer pending on LinkedIn and aren&apos;t connections. They
              may have been declined, withdrawn or expired; LinkedIn doesn&apos;t say which, so they are left unchanged. Update them
              yourself if you know.
            </li>
          ) : null}
          {s.incomingIgnored ? <li>{s.incomingIgnored} invitation(s) people sent you were ignored</li> : null}
        </ul>
      ) : null}

      {state.status === "preview" && s && s.newFromTargetSchools > 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="addNew" defaultChecked className="size-4 accent-primary" />
          Add the {s.newFromTargetSchools} new target-school connection(s) as candidates (their program is checked like any other)
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="mode" value="preview" variant={state.status === "preview" ? "outline" : "default"} disabled={pending}>
          {pending ? "Checking…" : "Preview"}
        </Button>
        {state.status === "preview" ? (
          <Button type="submit" name="mode" value="import" disabled={pending}>
            Apply
          </Button>
        ) : null}
        {state.status === "imported" ? (
          <p role="status" className="text-sm">
            {state.message}
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
