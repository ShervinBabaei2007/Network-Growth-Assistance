"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { linkDocument, unlinkDocument } from "../actions";
import type { DetailData } from "./detail-data";

export function Documents({ data }: { data: DetailData }) {
  const { pending, run } = useActionRunner();
  const [choice, setChoice] = useState("");
  const options = [...data.options.tailored.map((t) => ({ value: `t:${t.id}`, label: t.label })), ...data.options.resumes.map((r) => ({ value: `r:${r.id}`, label: r.label }))];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents sent</CardTitle>
        <CardDescription>Which version you sent.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {data.documents.length ? (
          <ul className="grid gap-2">
            {data.documents.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0 break-words">
                  {d.label}
                  <span className="block text-xs text-muted-foreground">
                    Linked {d.linkedOn}
                    {d.sourceGone ? " · original deleted, copy kept" : ""}
                  </span>
                </span>
                <Button size="icon-xs" variant="ghost" aria-label={`Unlink ${d.label}`} title={`Unlink ${d.label}`} disabled={pending} onClick={() => run(() => unlinkDocument(d.id))}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No documents linked.</p>
        )}
        {options.length ? (
          <form
            className="grid gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const [kind, id] = choice.split(":");
              if (id) run(() => linkDocument(data.id, kind === "t" ? { tailoredId: id } : { resumeId: id }));
            }}
          >
            <div className="grid gap-1">
              <Label htmlFor="doc-choice">Version</Label>
              <AppSelect id="doc-choice" value={choice} onChange={(e) => setChoice(e.target.value)} required>
                <option value="">Choose a document…</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AppSelect>
            </div>
            <Button type="submit" size="sm" variant="outline" className="justify-self-start" disabled={pending || !choice}>
              Link document
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
