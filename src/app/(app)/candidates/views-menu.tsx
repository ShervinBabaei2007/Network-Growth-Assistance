"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteView, saveView } from "./bulk-actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activeFilterCount, normalizeViewQuery, viewHref } from "@/lib/views";

export type SavedView = { id: string; name: string; query: string };

const LAST_KEY = "candidates:last-view";

/**
 * Remembers the last filters used on this device and brings them back when the page is opened with none. A
 * per-device convenience kept in the browser; saved views (below) are the part kept in the account.
 */
export function RememberLastView() {
  const router = useRouter();
  const search = useSearchParams();
  useEffect(() => {
    const current = normalizeViewQuery("candidates", search);
    try {
      if (search.size === 0) {
        const last = localStorage.getItem(LAST_KEY);
        if (last) router.replace(viewHref("candidates", normalizeViewQuery("candidates", last)));
        return;
      }
      if (current) localStorage.setItem(LAST_KEY, current);
      else localStorage.removeItem(LAST_KEY);
    } catch {
      // Storage can be blocked; the page works the same without it.
    }
  }, [search, router]);
  return null;
}

/** Saved views: open one, save the current filters under a name, or delete one. */
export function ViewsMenu({ views }: { views: SavedView[] }) {
  const search = useSearchParams();
  const pathname = usePathname();
  const { pending, run } = useActionRunner();
  const [name, setName] = useState("");
  const current = normalizeViewQuery("candidates", search);
  const count = activeFilterCount("candidates", search);

  return (
    <div className="grid gap-3" data-testid="views-menu">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {count === 0 ? "No filters applied." : `${count} filter${count === 1 ? "" : "s"} applied.`}
      </p>
      {views.length > 0 ? (
        <ul className="grid gap-1">
          {views.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2">
              <Link
                href={viewHref("candidates", v.query)}
                aria-current={v.query === current && pathname === "/candidates" ? "true" : undefined}
                className="min-w-0 truncate rounded-md px-2 py-1 text-sm underline-offset-4 hover:bg-muted hover:underline aria-[current=true]:font-semibold"
              >
                {v.name}
              </Link>
              <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Delete view ${v.name}`} onClick={() => run(() => deleteView(v.id))}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No saved views yet. Choose some filters, then save them here.</p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveView("candidates", name, current), { onSuccess: () => setName("") });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="view-name">Save these filters as</Label>
          <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Needs review · my school" />
        </div>
        <Button type="submit" size="sm" disabled={pending || !name.trim() || count === 0}>
          Save view
        </Button>
      </form>
    </div>
  );
}
