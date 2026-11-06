import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { PageHeaderT } from "@/components/tx";
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
import { LocaleScope } from "@/components/locale-scope";
import { formatters } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { addEmployer } from "../actions";
import { CrawlNowButton } from "./crawl-now";

export const metadata = { title: "Employers · Jobs · Network Growth" };
export const maxDuration = 60;

const PAGE = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function EmployersPage({ searchParams }: PageProps<"/jobs/employers">) {
  return (
    <div className="grid gap-6">
      <PageHeaderT
        back={{ href: "/jobs", label: "pages.backJobs" }}
        title="pages.employers.title"
        description="pages.employers.description"
      />
      <Suspense fallback={null}>
        <AddEmployerCard />
      </Suspense>
      <Suspense fallback={<PageSkeleton labelKey="loading.employers" />}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AddEmployerCard() {
  const t = await getT();
  return (
    <LocaleScope groups={["ui"]}>
      <Card>
        <CardHeader>
          <CardTitle>{t("msg.addAnEmployer5838")}</CardTitle>
          <CardDescription>{t("msg.pasteTheirCareersPagea5a7")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={addEmployer} submitLabel={t("msg.addEmployer73e4")} resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="name">{t("msg.employer96e4")}</Label>
                <Input id="name" name="name" required maxLength={200} placeholder="Acme Robotics" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="url">{t("msg.careersPageOrJob1ce3")}</Label>
                <Input id="url" name="url" type="url" required placeholder="https://jobs.lever.co/acme" />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="website">{t("msg.theirWebsiteOptionald18a")}</Label>
                <Input id="website" name="website" inputMode="url" maxLength={200} placeholder="https://www.acme.com" aria-describedby="website-hint" />
                <p id="website-hint" className="text-xs text-muted-foreground">{t("msg.theirOwnAddressNota583")}</p>
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </LocaleScope>
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
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("msg.crawler820d")}</CardTitle>
          <CardDescription>
            {runs?.length ? t("employersPage.lastRun", { ago: timeAgo(runs[0].started_at, Date.now(), locale), boards: runs[0].boards, jobs: runs[0].new_jobs, failed: runs[0].failed }) : t("employersPage.neverRun")}
            {t("employersPage.scheduleNote")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LocaleScope groups={["employersPage"]}>
            <CrawlNowButton />
          </LocaleScope>
        </CardContent>
      </Card>

      <section aria-labelledby="directory-heading" className="grid gap-3">
        <h2 id="directory-heading" className="font-medium">
          {t("employersPage.directory", { count: formatters(locale).number(total) })}
        </h2>
        <form role="search" className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="q">{t("msg.search1334")}</Label>
            <Input id="q" name="q" defaultValue={q} placeholder={t("msg.employerName568e")} />
          </div>
          <Button type="submit" size="sm">
            {t("msg.search1334")}
          </Button>
        </form>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>{t("msg.employer96e4")}</TableHead>
                <TableHead>{t("msg.board6036")}</TableHead>
                <TableHead className="text-right" title={t("msg.jobsOpenToThe554e")}>{t("msg.jobsKept7733")}</TableHead>
                <TableHead>{t("msg.lastRead6d73")}</TableHead>
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
                        {e.status === "failing" ? t("msg.notAnswering09a5") : t("msg.pausede991")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell label={t("msg.board6036")}>{ATS_LABELS[e.ats]}</TableCell>
                  <TableCell label={t("msg.jobsKept7733")} className="text-right">{e.matching_jobs}</TableCell>
                  <TableCell label={t("msg.lastRead6d73")} className="text-muted-foreground">{e.last_crawled_at ? timeAgo(e.last_crawled_at, Date.now(), locale) : t("msg.notYet9d76")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {pages > 1 ? (
          <nav aria-label={t("employersPage.pagesNav")} className="flex items-center gap-3 text-sm">
            {page > 1 ? <Link href={`/jobs/employers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`}>{t("employersPage.prev")}</Link> : null}
            <span className="text-muted-foreground">
              {t("employersPage.pageOf", { page, pages })}
            </span>
            {page < pages ? <Link href={`/jobs/employers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}>{t("employersPage.next")}</Link> : null}
          </nav>
        ) : null}
      </section>
    </>
  );
}
