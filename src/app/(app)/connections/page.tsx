import { Tx } from "@/components/tx";
import { Suspense } from "react";
import { PageNav } from "@/components/page-nav";
import type { Translator } from "@/lib/i18n";
import { Disclosure } from "@/components/disclosure";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { ExternalLink, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { LocaleScope } from "@/components/locale-scope";
import { formatters } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { addKnownConnection, deleteAllKnownConnections, deleteKnownConnection, updateKnownConnection } from "./actions";
import { ConnectionsImport } from "./connections-import";

export const metadata = { title: "Connections · Network Growth" };

const PAGE_SIZE = 50;

export default function ConnectionsPage({ searchParams }: PageProps<"/connections">) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold"><Tx k="pages.connections.title" /></h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          <Tx k="pages.connections.description" />
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle><Tx k="connectionsPage.importTitle" /></CardTitle>
          <CardDescription>
            <Tx k="connectionsPage.importDesc" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <LocaleScope groups={["connectionsPage"]}>
              <ConnectionsImport />
            </LocaleScope>
          </Suspense>
        </CardContent>
      </Card>

      <Disclosure summary={<Tx k="connectionsPage.addByHand" />}>
        <Suspense fallback={null}>
          <AddConnection />
        </Suspense>
      </Disclosure>

      <Suspense fallback={<PageSkeleton labelKey="loading.connections" />}>
        <ConnectionList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AddConnection() {
  const t = await getT();
  return (
    <LocaleScope groups={["ui"]}>
      <ActionForm action={addKnownConnection} submitLabel={t("connectionsPage.add")} resetOnSuccess>
        <ConnectionFields t={t} />
      </ActionForm>
    </LocaleScope>
  );
}

function ConnectionFields({ t, values, idPrefix = "new" }: { t: Translator; values?: { fullName: string; company: string | null; position: string | null; linkedinUrl: string | null }; idPrefix?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-name`}>{t("connectionsPage.name")}</Label>
        <Input id={`${idPrefix}-name`} name="fullName" required maxLength={200} defaultValue={values?.fullName} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-company`}>{t("connectionsPage.company")}</Label>
        <Input id={`${idPrefix}-company`} name="company" maxLength={200} defaultValue={values?.company ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-position`}>{t("connectionsPage.position")}</Label>
        <Input id={`${idPrefix}-position`} name="position" maxLength={300} defaultValue={values?.position ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-url`}>{t("connectionsPage.url")}</Label>
        <Input id={`${idPrefix}-url`} name="linkedinUrl" maxLength={500} defaultValue={values?.linkedinUrl ?? ""} placeholder="linkedin.com/in/…" />
      </div>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function ConnectionList({ searchParams }: Pick<PageProps<"/connections">, "searchParams">) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const page = Math.max(1, Number(one(params.page)) || 1);
  const supabase = await createClient();
  let query = supabase
    .from("known_connections")
    .select("id, full_name, company, position, linkedin_url, connected_on, source", { count: "exact" })
    .order("full_name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const term = q.replace(/[,()*%\\"':.]/g, " ").trim();
  if (term) query = query.or(["full_name", "company", "position"].map((c) => `${c}.ilike.*${term}*`).join(","));
  const { data, count, error } = await query;
  if (error) return <LoadError what="connections" />;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/connections?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <LocaleScope groups={["ui"]}>
    <section aria-labelledby="known-heading" className="grid gap-3">
      <h2 id="known-heading" className="text-base font-semibold">
        {t("connectionsPage.yourList")}
      </h2>
      <form role="search" className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="q">{t("connectionsPage.search")}</Label>
          <Input id="q" name="q" defaultValue={q} placeholder={t("connectionsPage.searchPlaceholder")} />
        </div>
        <Button type="submit" size="sm">
          {t("connectionsPage.search")}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 1 ? t("connectionsPage.countOne") : t("connectionsPage.countMany", { count: formatters(locale).number(total) })}
        {total > PAGE_SIZE ? t("list.pageOf", { page, pages }) : ""}
      </p>

      {data.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title={q ? t("connectionsPage.noMatchTitle") : t("connectionsPage.emptyTitle")}
          description={q ? t("connectionsPage.noMatchDesc") : t("connectionsPage.emptyDesc")}
        >
          {q ? (
            <Link href="/connections" className={buttonVariants({ size: "sm", variant: "outline" })}>
              {t("connectionsPage.clearSearch")}
            </Link>
          ) : null}
        </EmptyState>
      ) : (
        <Table stack>
          <TableHeader>
            <TableRow>
              <TableHead>{t("connectionsPage.name")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("connectionsPage.companyPosition")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("connectionsPage.source")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("connectionsPage.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="max-w-48 truncate font-medium">
                  {k.full_name}
                  {k.linkedin_url ? (
                    <a href={k.linkedin_url} target="_blank" rel="noopener noreferrer" aria-label={t("list.openOnLinkedIn", { name: k.full_name })} title={t("list.openOnLinkedIn", { name: k.full_name })} className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground">
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </TableCell>
                <TableCell label={t("connectionsPage.companyPosition")} className="hidden max-w-72 truncate whitespace-normal text-muted-foreground sm:table-cell">
                  {[k.company, k.position].filter(Boolean).join(" · ")}
                </TableCell>
                <TableCell label={t("connectionsPage.source")} className="hidden text-muted-foreground md:table-cell">{k.source === "linkedin_export" ? t("connectionsPage.sourceExport") : k.source === "csv" ? t("connectionsPage.sourceCsv") : t("connectionsPage.sourceHand")}</TableCell>
                <TableCell className="text-right">
                  <details className="inline-block text-left">
                    <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("connectionsPage.edit")}</summary>
                    <div className="mt-2 grid w-[min(90vw,32rem)] gap-3 rounded-lg border bg-background p-3">
                      <ActionForm action={updateKnownConnection} submitLabel={t("connectionsPage.save")} size="sm">
                        <input type="hidden" name="id" value={k.id} />
                        <ConnectionFields t={t} idPrefix={k.id} values={{ fullName: k.full_name, company: k.company, position: k.position, linkedinUrl: k.linkedin_url }} />
                      </ActionForm>
                      <ActionForm action={deleteKnownConnection} submitLabel={t("connectionsPage.delete")} variant="destructive" size="sm">
                        <input type="hidden" name="id" value={k.id} />
                      </ActionForm>
                    </div>
                  </details>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <PageNav current={page} pages={pages} href={href} />

      {total > 0 ? (
        <Disclosure summary={t("connectionsPage.deleteAll")}>
          <div className="grid gap-2">
            <p className="text-muted-foreground">{t("connectionsPage.deleteAllNote")}</p>
            <ActionForm action={deleteAllKnownConnections} submitLabel={t("connectionsPage.deleteAllButton")} variant="destructive" size="sm">
              <Label htmlFor="confirmDelete">{t("connectionsPage.typeDelete")}</Label>
              <Input id="confirmDelete" name="confirm" autoComplete="off" className="max-w-40" />
            </ActionForm>
          </div>
        </Disclosure>
      ) : null}
    </section>
    </LocaleScope>
  );
}
