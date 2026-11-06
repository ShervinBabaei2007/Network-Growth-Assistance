"use client";

import { useLocale, useTr } from "@/lib/i18n/client";
import { FormError } from "@/components/form-error";
import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { AlertFields, type AlertValue } from "@/components/alerts/alert-fields";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button, buttonVariants } from "@/components/ui/button";
import { deleteSearch, restoreSearch, updateSearch } from "./actions";

export type SearchItem = { id: string; href: string; value: AlertValue; lastRun: string | null; nextRun: string | null; error: string | null };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hourLabel = (h: number, locale: string) => new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString(locale === "fr-CA" ? "fr-CA" : "en-CA", { hour: "numeric", timeZone: "UTC" });
const schedule = (v: AlertValue, tr: ReturnType<typeof useTr>, locale: string) =>
  v.frequency === "off"
    ? tr("searchesPage.noAlerts", "No alerts")
    : v.frequency === "daily"
      ? tr("searchesPage.dailyAt", "Daily at {hour}", { hour: hourLabel(v.hour, locale) })
      : tr("searchesPage.weeklyAt", "{day}s at {hour}", { day: tr(`searchesPage.d${v.weekday}` as "searchesPage.d0", WEEKDAYS[v.weekday]!), hour: hourLabel(v.hour, locale) });

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
  const tr = useTr();
  const locale = useLocale();
  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4">
      {editing ? (
        <form
          className="grid gap-3"
          aria-label={tr("searchesPage.editName", "Edit {name}", { name: item.value.name })}
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
              {tr("msg.savec9cc", "Save")}
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
              {tr("msg.cancelea47", "Cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-0.5">
              <h2 className="font-medium break-words">{item.value.name}</h2>
              <p className="text-sm text-muted-foreground">
                {schedule(item.value, tr, locale)}
                {item.value.frequency !== "off" && item.value.emailDigest ? tr("searchesPage.alsoEmail", " · also by email") : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <Link href={item.href} className={buttonVariants({ size: "sm", variant: "outline" })}>
                {tr("msg.openc3bf", "Open")}<span className="sr-only">{tr("searchesPage.openSearch", " search {name}", { name: item.value.name })}</span>
              </Link>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil aria-hidden /> {tr("msg.edit7dce", "Edit")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label={tr("searchesPage.deleteName", "Delete {name}", { name: item.value.name })}
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
                <Trash2 aria-hidden /> {tr("msg.deletef2a6", "Delete")}
              </Button>
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {item.lastRun ? (
              <div>
                <dt className="inline">{tr("msg.lastChecked2f3c", "Last checked: ")}</dt>
                <dd className="inline">{item.lastRun}</dd>
              </div>
            ) : null}
            {item.nextRun ? (
              <div>
                <dt className="inline">{tr("msg.nextCheck1c84", "Next check: ")}</dt>
                <dd className="inline">{item.nextRun}</dd>
              </div>
            ) : null}
          </dl>
          {item.error ? (
            <FormError>
              {item.error}
            </FormError>
          ) : null}
        </>
      )}
    </li>
  );
}
