"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { linkContact, unlinkContact } from "../actions";
import type { DetailData } from "./detail-data";

const ROLE_LABEL: Record<string, string> = { recruiter: "Recruiter", hiring_manager: "Hiring manager", referrer: "Referrer", interviewer: "Interviewer", other: "Other" };

export function Contacts({ data }: { data: DetailData }) {
  const { pending, run } = useActionRunner();
  const [person, setPerson] = useState("");
  const [role, setRole] = useState<"recruiter" | "hiring_manager" | "referrer" | "interviewer" | "other">("recruiter");
  const linked = new Set(data.contacts.map((c) => c.personId));
  const available = data.options.people.filter((p) => !linked.has(p.id));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contacts</CardTitle>
        <CardDescription>People from your People list who are part of this application.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {data.contacts.length ? (
          <ul className="grid gap-2">
            {data.contacts.map((c) => (
              <li key={c.personId} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <Link href={`/people/${c.personId}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>{" "}
                  <span className="text-muted-foreground">· {ROLE_LABEL[c.role] ?? c.role}</span>
                  {c.title ? <span className="block text-xs break-words text-muted-foreground">{c.title}</span> : null}
                </span>
                <Button size="icon-xs" variant="ghost" aria-label={`Unlink ${c.name}`} title={`Unlink ${c.name}`} disabled={pending} onClick={() => run(() => unlinkContact(data.id, c.personId), { undo: () => linkContact(data.id, c.personId, c.role as typeof role) })}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No contacts linked.</p>
        )}
        {available.length ? (
          <form
            className="grid gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (person) run(() => linkContact(data.id, person, role), { undo: () => unlinkContact(data.id, person) });
            }}
          >
            <div className="grid gap-1">
              <Label htmlFor="contact-person">Person</Label>
              <AppSelect id="contact-person" value={person} onChange={(e) => setPerson(e.target.value)} required>
                <option value="">Choose someone…</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </AppSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="contact-role">Role</Label>
              <AppSelect id="contact-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                {Object.entries(ROLE_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </AppSelect>
            </div>
            <Button type="submit" size="sm" variant="outline" className="justify-self-start" disabled={pending || !person}>
              Link contact
            </Button>
          </form>
        ) : data.options.people.length ? null : (
          <p className="text-xs text-muted-foreground">
            Save people in <Link href="/people" className="text-primary hover:underline">People</Link> to link them here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
