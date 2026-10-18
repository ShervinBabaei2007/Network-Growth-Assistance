import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ATS_LABELS } from "@/lib/job-postings/ats";
import { timeAgo } from "@/lib/job-postings/labels";
import { createClient } from "@/lib/supabase/server";
import { addEmployer } from "../actions";
import { CrawlNowButton } from "./crawl-now";

export const metadata = { title: "Employers · Jobs · Network Growth" };
export const maxDuration = 60;

const PAGE = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function EmployersPage({ searchParams }: PageProps<"/jobs/employers">) {
  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title="Employers"
        description="Jobs are read from these employers' own job boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee and Workday), every 30 minutes (Workday sites every 3 hours) for employers hiring in the countries people search. Any field and any country: everyone shares this list, so add an employer you'd like to work for and everyone sees its jobs."
      />
      <Card>
        <CardHeader>
          <CardTitle>Add an employer</CardTitle>
          <CardDescription>Paste their careers page or job board link. It&apos;s added once its board answers.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={addEmployer} submitLabel="Add employer" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="name">Employer</Label>
                <Input id="name" name="name" required maxLength={200} placeholder="Acme Robotics" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="url">Careers page or job board</Label>
                <Input id="url" name="url" type="url" required placeholder="https://jobs.lever.co/acme" />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <Suspense fallback={<PageSkeleton label="Loading employers…" />}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Directory({ searchParams }: Pick<PageProps<"/jobs/employers">, "searchParams">) {
  const sp = await searchParams;
  const q = one(sp.q).trim().replace(/[,()*%\\"':.]/g, " ").trim();
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const supabase = await createClient();
  let query = supabase
    .from("employers")
    .select("id, name, ats, status, matching_jobs, last_crawled_at, careers_url, last_error", { count: "exact" })
    .order("matching_jobs", { ascending: false })
    .order("name")
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.ilike("name", `%${q}%`);
  const [{ data, count, error }, { data: runs }] = await Promise.all([query, supabase.from("job_crawl_runs").select("started_at, boards, new_jobs, failed, embedded").order("started_at", { ascending: false }).limit(5)]);
  if (error) return <LoadError what="employers" />;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Crawler</CardTitle>
          <CardDescription>
            {runs?.length ? `Last run ${timeAgo(runs[0].started_at)}: ${runs[0].boards} boards read, ${runs[0].new_jobs} new jobs, ${runs[0].failed} failed.` : "Hasn't run yet."} It runs on a
            schedule; reading now only reads boards that are already due.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CrawlNowButton />
        </CardContent>
      </Card>

      <section aria-labelledby="directory-heading" className="grid gap-3">
        <h2 id="directory-heading" className="font-medium">
          Directory ({total.toLocaleString("en-CA")})
        </h2>
        <form role="search" className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="q">Search</Label>
            <Input id="q" name="q" defaultValue={q} placeholder="Employer name" />
          </div>
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>Employer</TableHead>
                <TableHead>Board</TableHead>
                <TableHead className="text-right" title="Jobs open to the countries people search">Jobs kept</TableHead>
                <TableHead>Last read</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    {e.careers_url ? (
                      <a href={e.careers_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {e.name}
                      </a>
                    ) : (
                      e.name
                    )}
                    {e.status !== "active" ? (
                      <Badge variant="outline" className="ml-2" title={e.last_error ?? undefined}>
                        {e.status === "failing" ? "Not answering" : "Paused"}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell label="Board">{ATS_LABELS[e.ats]}</TableCell>
                  <TableCell label="Jobs kept" className="text-right">{e.matching_jobs}</TableCell>
                  <TableCell label="Last read" className="text-muted-foreground">{e.last_crawled_at ? timeAgo(e.last_crawled_at) : "Not yet"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {pages > 1 ? (
          <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
            {page > 1 ? <Link href={`/jobs/employers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`}>← Previous</Link> : null}
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            {page < pages ? <Link href={`/jobs/employers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}>Next →</Link> : null}
          </nav>
        ) : null}
      </section>
    </>
  );
}
