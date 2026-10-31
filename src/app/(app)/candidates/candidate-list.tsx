import { Disclosure } from "@/components/disclosure";
import { PageNav } from "@/components/page-nav";
import { Checkbox } from "@/components/ui/checkbox";
import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, SearchX, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadExample } from "@/components/load-example";
import { CategoryLabel, StatusBadge } from "@/components/candidate-badges";
import { ListKeyNav } from "@/components/list-key-nav";
import { LoadError } from "@/components/load-error";
import { AppSelect } from "@/components/app-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_LABELS, type CandidateStatus, type Discipline, type University } from "@/lib/domain";
import { loadCatalog } from "@/lib/data/catalog";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZES, parsePageSize } from "@/lib/views";
import { RowSelect, SelectAll } from "@/components/bulk/bulk-select";
import { BulkBar } from "./bulk-select";
import { ViewsMenu, type SavedView } from "@/components/views-menu";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The candidate list with its filters, saved views and bulk bar. Used by the list page and beside a record. */
export async function CandidateList({ searchParams }: Pick<PageProps<"/candidates">, "searchParams">) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const status = one(params.status) as CandidateStatus | "";
  const discipline = one(params.discipline) as Discipline | "";
  const university = one(params.university) as University | "";
  const review = one(params.review) === "1";
  const page = Math.max(1, Number(one(params.page)) || 1);
  const pageSize = parsePageSize(one(params.size));

  const supabase = await createClient();
  const [catalog, { data: viewRows }] = await Promise.all([
    loadCatalog(supabase),
    supabase.from("saved_views").select("id, name, query").eq("page", "candidates").order("created_at"),
  ]);
  const views: SavedView[] = viewRows ?? [];
  // Filters list the user's own schools and disciplines.
  const disciplineOptions = Object.fromEntries(catalog.disciplines.map((d) => [d.id, d.name]));
  const universityOptions = Object.fromEntries(catalog.universities.map((u) => [u.id, u.name]));
  let query = supabase
    .from("candidates")
    .select(
      "id, full_name, profile_url, university, discipline, university_confidence, discipline_confidence, status, role, discovered_at",
      { count: "exact" },
    )
    .order("discovered_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status && status in STATUS_LABELS) query = query.eq("status", status);
  if (discipline && discipline in disciplineOptions) query = query.eq("discipline", discipline);
  if (university && university in universityOptions) query = query.eq("university", university);
  if (review) query = query.or("university_confidence.eq.needs_review,discipline_confidence.eq.needs_review");
  if (q) {
    // Strip characters that have meaning in PostgREST filter syntax.
    const term = q.replace(/[,()*%\\"':.]/g, " ").trim();
    if (term) {
      query = query.or(
        ["full_name", "raw_school_text", "raw_program_text", "role", "profile_key"]
          .map((col) => `${col}.ilike.*${term}*`)
          .join(","),
      );
    }
  }

  const { data, count, error } = await query;
  if (error) return <LoadError what="candidates" />;

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, discipline, university, review: review ? "1" : "", size: pageSize === 50 ? "" : String(pageSize) })) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    return `/candidates${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <section aria-labelledby="list-heading" className="grid gap-3">
      <h2 id="list-heading" className="sr-only">
        Candidate list
      </h2>
      <div className="@container">
      <form key={`${q}|${status}|${discipline}|${university}|${review}|${pageSize}`} className="grid gap-3 rounded-lg border bg-card p-3 @lg:grid-cols-2 @3xl:grid-cols-4 @5xl:grid-cols-7" role="search">
        <div className="grid gap-1.5 @3xl:col-span-2">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="Name, school, program, role" />
        </div>
        <Filter id="status" label="Status" value={status} options={STATUS_LABELS} />
        <Filter id="discipline" label="Discipline" value={discipline} options={disciplineOptions} />
        <Filter id="university" label="School" value={university} options={universityOptions} />
        <div className="grid gap-1.5">
          <Label htmlFor="size">Per page</Label>
          <AppSelect id="size" name="size" defaultValue={String(pageSize)}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </AppSelect>
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 @lg:col-span-2 @3xl:col-span-2 @5xl:col-span-1">
          <label className="flex h-8 items-center gap-2 text-sm whitespace-nowrap">
            <Checkbox name="review" value="1" defaultChecked={review} />
            Needs review
          </label>
          <Button type="submit" size="sm">
            Filter
          </Button>
          <Link href="/candidates?clear=1" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Clear
          </Link>
        </div>
      </form>
      </div>

      <Disclosure id="views" summary={`Saved views${views.length ? ` (${views.length})` : ""}`}>
        <ViewsMenu page="candidates" views={views} />
      </Disclosure>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total.toLocaleString("en-CA")} candidate{total === 1 ? "" : "s"}
        {total > pageSize ? ` · page ${page} of ${pages}` : ""}
      </p>

      {data.length === 0 ? (
        q || status || discipline || university || review ? (
          <EmptyState icon={<SearchX aria-hidden />} title="No candidates match these filters" description="Try removing a filter or searching for something else.">
            <Link href="/candidates?clear=1" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Clear filters
            </Link>
          </EmptyState>
        ) : (
          <EmptyState
            icon={<Users aria-hidden />}
            title="No candidates yet"
            description="Paste profile links from your own LinkedIn searches, or import a list. Each person is sorted by school and program so you can approve them for your queue."
          >
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/candidates/import" className={buttonVariants({ size: "sm" })}>
                Import a list
              </Link>
              <Suspense fallback={null}>
                <LoadExample />
              </Suspense>
            </div>
          </EmptyState>
        )
      ) : (
        <ListKeyNav>
        <Table stack>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <SelectAll scope="candidates" ids={data.map((c) => c.id)} label="Select everyone on this page" />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>School · program</TableHead>
              <TableHead className="hidden md:table-cell">Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">LinkedIn</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id} className="has-[a[aria-current=true]]:bg-muted">
                <TableCell>
                  <RowSelect scope="candidates" id={c.id} name={c.full_name} />
                </TableCell>
                <TableCell className="max-w-48 truncate font-medium">
                  <Link href={`/candidates/${c.id}`} data-row-link className="underline-offset-4 hover:underline">
                    {c.full_name}
                  </Link>
                </TableCell>
                <TableCell label="School · program" className="whitespace-normal">
                  <CategoryLabel
                    university={c.university}
                    discipline={c.discipline}
                    confirmed={c.university_confidence === "confirmed" && c.discipline_confidence === "confirmed"}
                    catalog={catalog}
                  />
                </TableCell>
                <TableCell label="Role" className="hidden max-w-64 truncate text-muted-foreground md:table-cell">{c.role}</TableCell>
                <TableCell label="Status">
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell>
                  <a
                    href={c.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${c.full_name} on LinkedIn`} title={`Open ${c.full_name} on LinkedIn`}
                    className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                  >
                    <ExternalLink />
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </ListKeyNav>
      )}

      <PageNav current={page} pages={pages} href={pageHref} />
      <BulkBar />
    </section>
  );
}

function Filter({
  id,
  label,
  value,
  options,
}: {
  id: string;
  label: string;
  value: string;
  options: Record<string, string>;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <AppSelect id={id} name={id} defaultValue={value}>
        <option value="">All</option>
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </AppSelect>
    </div>
  );
}

