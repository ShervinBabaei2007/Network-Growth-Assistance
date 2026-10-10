import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, Upload } from "lucide-react";
import { CategoryLabel, StatusBadge } from "@/components/candidate-badges";
import { LoadError } from "@/components/load-error";
import { NativeSelect } from "@/components/native-select";
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
import { DISCIPLINE_LABELS, STATUS_LABELS, UNIVERSITY_LABELS, type CandidateStatus, type Discipline, type University } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { QuickAddForm } from "./quick-add";
import { QuickCapture } from "./quick-capture";

export const metadata = { title: "Candidates · Network Growth" };

const PAGE_SIZE = 50;

export default function CandidatesPage({ searchParams }: PageProps<"/candidates">) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Candidates</h1>
        <Link href="/candidates/import" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Upload aria-hidden /> Import
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick capture from LinkedIn search</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <QuickCaptureForUser />
          </Suspense>
        </CardContent>
      </Card>

      <Card id="add">
        <details className="group">
          <summary className="cursor-pointer list-none px-4 [&::-webkit-details-marker]:hidden">
            <CardTitle className="flex items-center justify-between">
              Add one person by hand
              <span className="text-sm font-normal text-muted-foreground group-open:hidden">Show</span>
              <span className="hidden text-sm font-normal text-muted-foreground group-open:inline">Hide</span>
            </CardTitle>
          </summary>
          <CardContent className="pt-4">
            <QuickAddForm />
          </CardContent>
        </details>
      </Card>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading candidates…</p>}>
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

  const supabase = await createClient();
  let query = supabase
    .from("candidates")
    .select(
      "id, full_name, profile_url, university, discipline, university_confidence, discipline_confidence, status, role, discovered_at",
      { count: "exact" },
    )
    .order("discovered_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status && status in STATUS_LABELS) query = query.eq("status", status);
  if (discipline && discipline in DISCIPLINE_LABELS) query = query.eq("discipline", discipline);
  if (university && university in UNIVERSITY_LABELS) query = query.eq("university", university);
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
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, discipline, university, review: review ? "1" : "" })) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    return `/candidates${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <section aria-labelledby="list-heading" className="grid gap-3">
      <h2 id="list-heading" className="sr-only">
        Candidate list
      </h2>
      <form className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <div className="grid gap-1.5 lg:col-span-2">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="Name, school, program, role" />
        </div>
        <Filter id="status" label="Status" value={status} options={STATUS_LABELS} />
        <Filter id="discipline" label="Discipline" value={discipline} options={DISCIPLINE_LABELS} />
        <Filter id="university" label="University" value={university} options={UNIVERSITY_LABELS} />
        <div className="flex items-end gap-3">
          <label className="flex h-8 items-center gap-2 text-sm">
            <input type="checkbox" name="review" value="1" defaultChecked={review} className="size-4 accent-primary" />
            Needs review
          </label>
          <Button type="submit" size="sm">
            Filter
          </Button>
        </div>
      </form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total.toLocaleString("en-CA")} candidate{total === 1 ? "" : "s"}
        {total > PAGE_SIZE ? ` · page ${page} of ${pages}` : ""}
      </p>

      {data.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          {q || status || discipline || university || review
            ? "No candidates match these filters."
            : "No candidates yet. Add people you find through LinkedIn search, or import a list."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell className="max-w-48 truncate font-medium">
                  <Link href={`/candidates/${c.id}`} className="underline-offset-4 hover:underline">
                    {c.full_name}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <CategoryLabel
                    university={c.university}
                    discipline={c.discipline}
                    confirmed={c.university_confidence === "confirmed" && c.discipline_confidence === "confirmed"}
                  />
                </TableCell>
                <TableCell className="hidden max-w-64 truncate text-muted-foreground md:table-cell">{c.role}</TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell>
                  <a
                    href={c.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${c.full_name} on LinkedIn`}
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

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex gap-2">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Previous
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
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
      <NativeSelect id={id} name={id} defaultValue={value}>
        <option value="">All</option>
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

async function QuickCaptureForUser() {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("count_ubco_as_ubc, auto_approve").single();
  return <QuickCapture countUbcoAsUbc={data?.count_ubco_as_ubc ?? true} autoApprove={data?.auto_approve ?? false} />;
}
