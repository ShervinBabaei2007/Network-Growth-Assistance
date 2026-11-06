"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteView, saveView } from "@/lib/views-actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activeFilterCount, normalizeViewQuery, viewHref, type ViewPage } from "@/lib/views";
import { useTr } from "@/lib/i18n/client";

export type SavedView = { id: string; name: string; query: string };


/**
 * Remembers the last filters used on this device and brings them back when the page is opened with none. A
 * per-device convenience kept in the browser; saved views (below) are the part kept in the account.
 */
export function RememberLastView({ page }: { page: ViewPage }) {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();
  useEffect(() => {
    // The list page stays mounted while a record is open beside it (the URL is /people/ID, with no filters). Only the
    // list's own URL is a "no filters" visit; anywhere else this must not send the person back to the list.
    if (pathname !== `/${page}`) return;
    const LAST_KEY = `${page}:last-view`;
    const current = normalizeViewQuery(page, search);
    try {
      if (search.size === 0) {
        const last = localStorage.getItem(LAST_KEY);
        if (last) router.replace(viewHref(page, normalizeViewQuery(page, last)));
        return;
      }
      if (current) localStorage.setItem(LAST_KEY, current);
      else localStorage.removeItem(LAST_KEY);
    } catch {
      // Storage can be blocked; the page works the same without it.
    }
  }, [page, pathname, search, router]);
  return null;
}

/** Saved views: open one, save the current filters under a name, or delete one. */
export function ViewsMenu({ page, views }: { page: ViewPage; views: SavedView[] }) {
  const search = useSearchParams();
  const pathname = usePathname();
  const { pending, run } = useActionRunner();
  const tr = useTr();
  const [name, setName] = useState("");
  const current = normalizeViewQuery(page, search);
  const count = activeFilterCount(page, search);

  return (
    <div className="grid gap-3" data-testid="views-menu">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {count === 0 ? tr("views.noFilters", "No filters applied.") : count === 1 ? tr("views.filtersOne", "1 filter applied.") : tr("views.filtersMany", "{count} filters applied.", { count })}
      </p>
      {views.length > 0 ? (
        <ul className="grid gap-1">
          {views.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2">
              <Link
                href={viewHref(page, v.query)}
                aria-current={v.query === current && pathname === `/${page}` ? "true" : undefined}
                className="min-w-0 truncate rounded-md px-2 py-1 text-sm underline-offset-4 hover:bg-muted hover:underline aria-[current=true]:font-semibold"
              >
                {v.name}
              </Link>
              <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={tr("views.deleteView", "Delete view {name}", { name: v.name })} onClick={() => run(() => deleteView(v.id))}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{tr("views.none", "No saved views yet. Choose some filters, then save them here.")}</p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveView(page, name, current), { onSuccess: () => setName("") });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="view-name">{tr("views.saveAs", "Save these filters as")}</Label>
          <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={tr("views.placeholder", "Needs review · my school")} />
        </div>
        <Button type="submit" size="sm" disabled={pending || !name.trim() || !current}>
          {tr("views.save", "Save view")}
        </Button>
      </form>
    </div>
  );
}
