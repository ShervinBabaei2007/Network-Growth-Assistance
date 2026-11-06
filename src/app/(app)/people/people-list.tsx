import { Suspense } from "react";
import { PageNav } from "@/components/page-nav";
import { BookUser } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { Disclosure } from "@/components/disclosure";
import { ListKeyNav } from "@/components/list-key-nav";
import { LoadError } from "@/components/load-error";
import { type SavedView } from "@/components/views-menu";
import { SavedViews } from "@/components/saved-views";
import { PAGE_SIZES, parsePageSize } from "@/lib/views";
import { LoadExample } from "@/components/load-example";
import { RowSelect, SelectAll } from "@/components/bulk/bulk-select";
import { PeopleBulkBar } from "./bulk-bar";
import { AppSelect } from "@/components/app-select";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { localDate } from "@/lib/dates";
import { CRM_STATUS_LABELS } from "@/lib/discovery/labels";
import { createClient } from "@/lib/supabase/server";
import { LocaleScope } from "@/components/locale-scope";
import { formatters } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The saved-people list with its filters, saved views and bulk bar. Used by the list page and beside a record. */
export async function PeopleList({ searchParams }: Pick<PageProps<"/people">, "searchParams">) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const status = one(sp.status);
  const tag = one(sp.tag).trim();
  const due = one(sp.due) === "1";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const PAGE_SIZE = parsePageSize(one(sp.size));

  const supabase = await createClient();
  const [{ data: settings }, { data: viewRows }] = await Promise.all([
    supabase.from("settings").select("timezone").single(),
    supabase.from("saved_views").select("id, name, query").eq("page", "people").order("created_at"),
  ]);
  const views: SavedView[] = viewRows ?? [];
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
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, tag, due: due ? "1" : "", size: PAGE_SIZE === 50 ? "" : String(PAGE_SIZE) })) if (v) s.set(k, v);
    if (p > 1) s.set("page", String(p));
    return `/people${s.size ? `?${s}` : ""}`;
  };

  return (
    <LocaleScope groups={["list", "peoplePage"]}>
    <section aria-labelledby="people-heading" className="grid gap-3">
      <h2 id="people-heading" className="sr-only">
        {t("peoplePage.savedPeople")}
      </h2>
      <div className="@container">
      <form role="search" className="grid gap-3 rounded-lg border bg-card p-3 @lg:grid-cols-2 @3xl:grid-cols-4 @5xl:grid-cols-6">
        <div className="grid gap-1.5 @3xl:col-span-2">
          <Label htmlFor="q">{t("candidatesPage.searchLabel")}</Label>
          <Input id="q" name="q" defaultValue={q} placeholder={t("peoplePage.searchPlaceholder")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="status">{t("list.status")}</Label>
          <AppSelect id="status" name="status" defaultValue={status}>
            <option value="">{t("list.all")}</option>
            {Object.keys(CRM_STATUS_LABELS).map((v) => (
              <option key={v} value={v}>
                {t(`crm.${v as keyof typeof CRM_STATUS_LABELS}`)}
              </option>
            ))}
          </AppSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tag">{t("peoplePage.tag")}</Label>
          <Input id="tag" name="tag" defaultValue={tag} placeholder={t("peoplePage.tagPlaceholder")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="size">{t("list.perPage")}</Label>
          <AppSelect id="size" name="size" defaultValue={String(PAGE_SIZE)}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </AppSelect>
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 @lg:col-span-2 @3xl:col-span-2 @5xl:col-span-1">
          <label className="flex h-8 items-center gap-2 text-sm whitespace-nowrap">
            <Checkbox name="due" value="1" defaultChecked={due} />
            {t("peoplePage.reminderDue")}
          </label>
          <Button type="submit" size="sm">
            {t("list.filter")}
          </Button>
        </div>
      </form>
      </div>

      <Disclosure id="views" summary={views.length ? t("list.savedViewsCount", { count: views.length }) : t("list.savedViews")}>
        <SavedViews page="people" views={views} />
      </Disclosure>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 1 ? t("peoplePage.countOne") : t("peoplePage.countMany", { count: formatters(locale).number(total) })}
        {total > PAGE_SIZE ? t("list.pageOf", { page, pages }) : ""}
      </p>

      {data.length === 0 ? (
        <EmptyState
          icon={<BookUser aria-hidden />}
          title={q || status || tag || due ? t("peoplePage.noMatchTitle") : t("peoplePage.emptyTitle")}
          description={q || status || tag || due ? t("peoplePage.noMatchDesc") : t("peoplePage.emptyDesc")}
        >
          {q || status || tag || due ? (
            <Link href="/people?clear=1" className={buttonVariants({ size: "sm", variant: "outline" })}>
              {t("list.clearFilters")}
            </Link>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/discover" className={buttonVariants({ size: "sm" })}>
                {t("peoplePage.goDiscover")}
              </Link>
              <Suspense fallback={null}>
                <LoadExample />
              </Suspense>
            </div>
          )}
        </EmptyState>
      ) : (
        <ListKeyNav>
        <Table stack>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <SelectAll scope="people" ids={data.map((p) => p.id)} label={t("list.selectEveryone")} />
              </TableHead>
              <TableHead>{t("list.name")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("list.role")}</TableHead>
              <TableHead>{t("list.status")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("peoplePage.connection")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("peoplePage.reminder")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.id} className="has-[a[aria-current=true]]:bg-muted">
                <TableCell>
                  <RowSelect scope="people" id={p.id} name={p.full_name} />
                </TableCell>
                <TableCell className="max-w-48 truncate font-medium">
                  <Link href={`/people/${p.id}`} data-row-link className="underline-offset-4 hover:underline">
                    {p.full_name}
                  </Link>
                  {p.tags.length ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {p.tags.slice(0, 4).map((tg) => (
                        <Badge key={tg} variant="outline">
                          {tg}
                        </Badge>
                      ))}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell label={t("list.role")} className="hidden max-w-64 truncate text-muted-foreground md:table-cell">{[p.current_title, p.current_company].filter(Boolean).join(" @ ")}</TableCell>
                <TableCell label={t("list.status")}>
                  <Badge variant={p.crm_status === "connected" || p.crm_status === "replied" ? "secondary" : p.crm_status === "ready_to_connect" ? "default" : "outline"}>{t(`crm.${p.crm_status}`)}</Badge>
                </TableCell>
                <TableCell label={t("peoplePage.connection")} className="hidden text-muted-foreground lg:table-cell">{t(`proximity.${p.proximity}`)}</TableCell>
                <TableCell label={t("peoplePage.reminder")} className="hidden tabular-nums sm:table-cell">
                  {p.reminder_at ? <span className={p.reminder_at <= today ? "font-medium text-destructive" : "text-muted-foreground"}>{p.reminder_at}</span> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </ListKeyNav>
      )}

      <PageNav current={page} pages={pages} href={href} />
      <PeopleBulkBar />
    </section>
    </LocaleScope>
  );
}
