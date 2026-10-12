"use client";

import { useState } from "react";
import Link from "next/link";
import { BellPlus } from "lucide-react";
import { deleteSearch, saveSearch } from "@/app/(app)/jobs/searches/actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { AlertFields, type AlertValue } from "./alert-fields";

/** "Save this search": keeps the current Jobs search, optionally with alerts for new jobs. */
export function SaveSearch({ params, suggestedName, emailAvailable, timeZone }: { params: Record<string, string>; suggestedName: string; emailAvailable: boolean; timeZone: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<AlertValue>({ name: suggestedName, frequency: "daily", weekday: 1, hour: 8, emailDigest: false });
  const { pending, run } = useActionRunner();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
          <BellPlus aria-hidden /> Save this search
        </Button>
        <Link href="/jobs/searches" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Saved searches
        </Link>
      </div>
      {open ? (
        <form
          className="grid gap-3 rounded-xl border bg-card p-4"
          aria-label="Save this search"
          onSubmit={(e) => {
            e.preventDefault();
            let id = "";
            run(
              async () => {
                const r = await saveSearch(params, value);
                if (r.ok) {
                  id = r.data?.id ?? "";
                  setOpen(false);
                }
                return r;
              },
              { progress: "Saving the search…", undo: () => deleteSearch(id) },
            );
          }}
        >
          <AlertFields value={value} onChange={setValue} emailAvailable={emailAvailable} timeZone={timeZone} />
          <p className="text-xs text-muted-foreground">Jobs this search shows now are counted as seen: only jobs that appear later are announced.</p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Save search
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
