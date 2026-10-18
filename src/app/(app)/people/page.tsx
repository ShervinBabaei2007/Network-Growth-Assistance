import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { LoadError } from "@/components/load-error";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { localDate } from "@/lib/dates";
import { CRM_STATUS_LABELS, PROXIMITY_LABELS } from "@/lib/discovery/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "People · Network Growth" };

const PAGE_SIZE = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function PeoplePage({ searchParams }: PageProps<"/people">) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">People worth meeting</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            People you saved from research, with their status, notes and reminders. Every LinkedIn step is yours to take: open their profile, connect
            if you choose, then record it here.
          </p>
        </div>
        <Link href="/discover" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Discover more
        </Link>
      </div>
      <Suspense fallback={<PageSkeleton label="Loading people…" />}>
        <PeopleList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PeopleList({ searchParams }: Pick<PageProps<"/people">, "searchParams">) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const status = one(sp.status);
  const tag = one(sp.tag).trim();
  const due = one(sp.due) === "1";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("timezone").single();
  const today = localDate(new Date(), settings?.timezone ?? "UTC");

  let query = supabase
    .from("network_people")
    .select("id, full_name, current_title, current_company, crm_status, proximity, tags, reminder_at, relevance_score, linkedin_url", { count: "exact" })
    .eq("saved", true)
    .order("reminder_at", { ascending: true, nullsFirst: false })
    .order("relevance_score", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status && status in CRM_STATUS_LABELS) query = query.eq("crm_status", status as keyof typeof CRM_STATUS_LABELS);
  if (tag) query = query.contains("tags", [tag]);
  if (due) query = query.lte("reminder_at", today);
  const term = q.replace(/[,()*%\\"':.]/g, " ").trim();
  if (term) query = query.or(["full_name", "current_company", "current_title", "notes"].map((c) => `${c}.ilike.*${term}*`).join(","));

  const { data, count, error } = await query;
  if (error) return <LoadError what="people" />;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, tag, due: due ? "1" : "" })) if (v) s.set(k, v);
    if (p > 1) s.set("page", String(p));
    return `/people${s.size ? `?${s}` : ""}`;
  };

  return (
    <section aria-labelledby="people-heading" className="grid gap-3">
      <h2 id="people-heading" className="sr-only">
        Saved people
      </h2>
      <form role="search" className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-1.5 lg:col-span-2">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="Name, company, role, notes" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" name="status" defaultValue={status}>
            <option value="">All</option>
            {Object.entries(CRM_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tag">Tag</Label>
          <Input id="tag" name="tag" defaultValue={tag} placeholder="A tag you added" />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex h-8 items-center gap-2 text-sm">
            <input type="checkbox" name="due" value="1" defaultChecked={due} className="size-4 accent-primary" />
            Reminder due
          </label>
          <Button type="submit" size="sm">
            Filter
          </Button>
        </div>
      </form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total.toLocaleString("en-CA")} {total === 1 ? "person" : "people"}
        {total > PAGE_SIZE ? ` · page ${page} of ${pages}` : ""}
      </p>

      {data.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          {q || status || tag || due ? "Nobody matches these filters." : "No saved people yet. Run a search in Discover and save the people worth meeting."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Connection</TableHead>
              <TableHead className="hidden sm:table-cell">Reminder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="max-w-48 truncate font-medium">
                  <Link href={`/people/${p.id}`} className="underline-offset-4 hover:underline">
                    {p.full_name}
                  </Link>
                  {p.tags.length ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {p.tags.slice(0, 4).map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="hidden max-w-64 truncate text-muted-foreground md:table-cell">{[p.current_title, p.current_company].filter(Boolean).join(" @ ")}</TableCell>
                <TableCell>
                  <Badge variant={p.crm_status === "connected" || p.crm_status === "replied" ? "secondary" : p.crm_status === "ready_to_connect" ? "default" : "outline"}>{CRM_STATUS_LABELS[p.crm_status]}</Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{PROXIMITY_LABELS[p.proximity]}</TableCell>
                <TableCell className="hidden tabular-nums sm:table-cell">
                  {p.reminder_at ? <span className={p.reminder_at <= today ? "font-medium text-destructive" : "text-muted-foreground"}>{p.reminder_at}</span> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Previous
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={href(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
