"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { AlertFields, type AlertValue } from "@/components/alerts/alert-fields";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button, buttonVariants } from "@/components/ui/button";
import { deleteSearch, restoreSearch, updateSearch } from "./actions";

export type SearchItem = { id: string; href: string; value: AlertValue; lastRun: string | null; nextRun: string | null; error: string | null };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hourLabel = (h: number) => new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString("en-CA", { hour: "numeric", timeZone: "UTC" });
const schedule = (v: AlertValue) => (v.frequency === "off" ? "No alerts" : v.frequency === "daily" ? `Daily at ${hourLabel(v.hour)}` : `${WEEKDAYS[v.weekday]}s at ${hourLabel(v.hour)}`);

export function SearchList({ items, emailAvailable, timeZone }: { items: SearchItem[]; emailAvailable: boolean; timeZone: string }) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <SearchRow key={item.id} item={item} emailAvailable={emailAvailable} timeZone={timeZone} />
      ))}
    </ul>
  );
}

function SearchRow({ item, emailAvailable, timeZone }: { item: SearchItem; emailAvailable: boolean; timeZone: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.value);
  const { pending, run } = useActionRunner();
  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4">
      {editing ? (
        <form
          className="grid gap-3"
          aria-label={`Edit ${item.value.name}`}
          onSubmit={(e) => {
            e.preventDefault();
            run(
              async () => {
                const r = await updateSearch(item.id, value);
                if (r.ok) setEditing(false);
                return r;
              },
              { undo: () => updateSearch(item.id, item.value) },
            );
          }}
        >
          <AlertFields value={value} onChange={setValue} emailAvailable={emailAvailable} timeZone={timeZone} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue(item.value);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-0.5">
              <h2 className="font-medium break-words">{item.value.name}</h2>
              <p className="text-sm text-muted-foreground">
                {schedule(item.value)}
                {item.value.frequency !== "off" && item.value.emailDigest ? " · also by email" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <Link href={item.href} className={buttonVariants({ size: "sm", variant: "outline" })}>
                Open<span className="sr-only"> search {item.value.name}</span>
              </Link>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil aria-hidden /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label={`Delete ${item.value.name}`}
                onClick={() => {
                  let snapshot: unknown = null;
                  run(
                    async () => {
                      const r = await deleteSearch(item.id);
                      if (r.ok) snapshot = r.data?.snapshot;
                      return r;
                    },
                    { undo: () => restoreSearch(snapshot) },
                  );
                }}
              >
                <Trash2 aria-hidden /> Delete
              </Button>
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {item.lastRun ? (
              <div>
                <dt className="inline">Last checked: </dt>
                <dd className="inline">{item.lastRun}</dd>
              </div>
            ) : null}
            {item.nextRun ? (
              <div>
                <dt className="inline">Next check: </dt>
                <dd className="inline">{item.nextRun}</dd>
              </div>
            ) : null}
          </dl>
          {item.error ? (
            <p role="alert" className="text-sm text-destructive">
              {item.error}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}
