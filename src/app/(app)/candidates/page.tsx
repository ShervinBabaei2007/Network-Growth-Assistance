import { unstable_rethrow } from "next/navigation";
import { Disclosure } from "@/components/disclosure";
import { PageNav } from "@/components/page-nav";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { PageSkeleton } from "@/components/page-skeleton";
import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, Upload } from "lucide-react";
import { CategoryLabel, StatusBadge } from "@/components/candidate-badges";
import { LoadError } from "@/components/load-error";
import { AppSelect } from "@/components/app-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS_LABELS, type CandidateStatus, type Discipline, type University } from "@/lib/domain";
import { loadCatalog } from "@/lib/data/catalog";
import { loadMyProgress } from "@/lib/data/dashboard";
import { searchLinks } from "@/lib/prioritize/search-links";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZES, parsePageSize } from "@/lib/views";
import { BulkBar, RowSelect, SelectAll } from "./bulk-select";
import { QuickAddForm } from "./quick-add";
import { QuickCapture } from "./quick-capture";
import { RememberLastView, ViewsMenu, type SavedView } from "./views-menu";

export const metadata = { title: "Candidates · Network Growth" };

export default function CandidatesPage({ searchParams }: PageProps<"/candidates">) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">Candidates</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            LinkedIn search results you paste in, tracked from review to invitation to acceptance. Accepted candidates count toward your targets.
            Looking for people to research instead? Try Discover.
          </p>
        </div>
        <Link href="/candidates/import" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Upload aria-hidden /> Import
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick capture from LinkedIn search</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Suspense fallback={null}>
            <SearchShortcuts />
            <QuickCaptureForUser />
          </Suspense>
        </CardContent>
      </Card>

      <Disclosure id="add" summary="Add one person by hand">
            <QuickAddForm />
      </Disclosure>

      <Suspense fallback={null}>
        <RememberLastView />
      </Suspense>

      <Suspense fallback={<PageSkeleton label="Loading candidates…" />}>
        <CandidateList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function CandidateList({ searchParams }: Pick<PageProps<"/candidates">, "searchParams">) {
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
      <form className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-7" role="search">
        <div className="grid gap-1.5 lg:col-span-2">
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
        <div className="flex items-end gap-3">
          <label className="flex h-8 items-center gap-2 text-sm">
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

      <Disclosure id="views" summary={`Saved views${views.length ? ` (${views.length})` : ""}`}>
        <ViewsMenu views={views} />
      </Disclosure>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total.toLocaleString("en-CA")} candidate{total === 1 ? "" : "s"}
        {total > pageSize ? ` · page ${page} of ${pages}` : ""}
      </p>

      {data.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          {q || status || discipline || university || review
            ? "No candidates match these filters."
            : "No candidates yet. Add people you find through LinkedIn search, or import a list."}
        </p>
      ) : (
        <Table stack>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <SelectAll ids={data.map((c) => c.id)} />
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
              <TableRow key={c.id}>
                <TableCell>
                  <RowSelect id={c.id} name={c.full_name} />
                </TableCell>
                <TableCell className="max-w-48 truncate font-medium">
                  <Link href={`/candidates/${c.id}`} className="underline-offset-4 hover:underline">
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

async function QuickCaptureForUser() {
  const supabase = await createClient();
  const [{ data }, catalog] = await Promise.all([supabase.from("settings").select("auto_approve").single(), loadCatalog(supabase)]);
  return <QuickCapture catalog={catalog} autoApprove={data?.auto_approve ?? false} />;
}

/** One-click LinkedIn searches for the categories that still need people, most important first. */
async function SearchShortcuts() {
  let links;
  try {
    const progress = await loadMyProgress();
    links = searchLinks(progress.disciplines, progress.catalog);
  } catch (e) {
    unstable_rethrow(e);
    return null; // shortcuts are a convenience; the paste box still works without them
  }
  if (links.length === 0) return null;

  return (
    <nav aria-label="LinkedIn search shortcuts" className="grid gap-2">
      <p className="text-sm font-medium">1. Open a search on LinkedIn</p>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={`${l.discipline}-${l.university}`}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              // Long labels wrap on a phone instead of running off the screen.
              className={cn(buttonVariants({ variant: l.isAlternate ? "ghost" : "outline", size: "sm" }), "h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal")}
            >
              {l.label}
              {l.remaining !== null ? <span className="text-muted-foreground">· {l.remaining} to go</span> : <span className="text-muted-foreground">· extra</span>}
              <ExternalLink aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium">2. Press Ctrl+A, Ctrl+C there, then paste below</p>
    </nav>
  );
}
