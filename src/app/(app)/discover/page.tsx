import { Suspense } from "react";
import { Disclosure } from "@/components/disclosure";
import { PageHeaderT } from "@/components/tx";
import { LocaleScope } from "@/components/locale-scope";
import { formatters, type MessageKey } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeCriteria, NetworkingCriteria } from "@/lib/discovery/criteria";
import { discoveryStatus } from "@/lib/discovery/providers/registry";
import { createClient } from "@/lib/supabase/server";
import { deleteSearch, runSearchAgain, saveNetworkingGoal } from "../people/actions";
import { CriteriaEditor, DiscoverForm } from "./discover-form";

export const metadata = { title: "Discover · Network Growth" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function DiscoverPage({ searchParams }: PageProps<"/discover">) {
  return (
    <div className="grid gap-6">
      <PageHeaderT title="pages.discover.title" description="pages.discover.description" />

      <Suspense fallback={null}>
        <RequestCard searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<PageSkeleton labelKey="loading.searches" />}>
        <History />
      </Suspense>
    </div>
  );
}

async function RequestCard({ searchParams }: Pick<PageProps<"/discover">, "searchParams">) {
  const params = await searchParams;
  const from = one(params.from);
  const supabase = await createClient();
  const [{ count: known }, { data: settings }, modify] = await Promise.all([
    supabase.from("known_connections").select("id", { count: "exact", head: true }),
    supabase.from("settings").select("networking_goal").single(),
    /^[0-9a-f-]{36}$/i.test(from) ? supabase.from("network_searches").select("id, original_query, criteria").eq("id", from).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const modifyCriteria = modify.data ? NetworkingCriteria.safeParse(modify.data.criteria) : null;
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{modify.data ? t("discoverPage.modifyTitle") : t("discoverPage.whoTitle")}</CardTitle>
          {modify.data ? <CardDescription>{t("discoverPage.startedFrom", { query: modify.data.original_query })}</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          {modify.data && modifyCriteria?.success ? (
            <CriteriaEditor query={modify.data.original_query} criteria={modifyCriteria.data} parentSearchId={modify.data.id} />
          ) : (
            <DiscoverForm initialQuery={one(params.q)} error={one(params.error) || undefined} />
          )}
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {(known ?? 0) > 0 ? (
              <li>{t("discoverPage.knownLeftOut", { count: formatters(locale).number(known ?? 0) })}</li>
            ) : (
              <li>
                <Link href="/connections" className="underline underline-offset-4">
                  {t("discoverPage.importFirstA")}
                </Link>
                {t("discoverPage.importFirstB")}
              </li>
            )}
          </ul>
          {/* Not shown: lets the e2e specs tell whether the dev server runs with fixture sources. */}
          <span hidden data-testid="discovery-sources">
            Sources: {discoveryStatus().providers.join(", ")}
          </span>
        </CardContent>
      </Card>

      <Disclosure summary={t("discoverPage.goalSummary")}>
        <LocaleScope groups={["ui"]}>
          <ActionForm action={saveNetworkingGoal} submitLabel={t("discoverPage.save")}>
            <div className="grid gap-1.5">
              <Label htmlFor="goal">{t("discoverPage.goalLabel")}</Label>
              <Input id="goal" name="goal" maxLength={300} defaultValue={settings?.networking_goal ?? ""} placeholder={t("discoverPage.goalPlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("discoverPage.goalNote")}</p>
            </div>
          </ActionForm>
        </LocaleScope>
      </Disclosure>
    </>
  );
}

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  completed: "secondary",
  running: "default",
  queued: "default",
  failed: "destructive",
  cancelled: "outline",
};

async function History() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("network_searches")
    .select("id, original_query, criteria, status, counters, target_count, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return <LoadError what="your searches" />;
  if (!data.length) return null;
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  return (
    <section aria-labelledby="history-heading" className="grid gap-3">
      <h2 id="history-heading" className="text-base font-semibold">
        {t("discoverPage.historyHeading")}
      </h2>
      <ul className="grid gap-2">
        {data.map((s) => {
          const counters = (s.counters ?? {}) as { verified?: number; possible?: number };
          const criteria = NetworkingCriteria.safeParse(s.criteria);
          return (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
              <div className="grid min-w-0 gap-1">
                <Link href={`/discover/${s.id}`} className="truncate font-medium underline-offset-4 hover:underline">
                  {s.original_query}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {formatters(locale).date(s.created_at, { month: "short", day: "numeric", year: "numeric" })}
                  {criteria.success ? ` · ${describeCriteria(criteria.data)}` : ""}
                  {" · "}
                  {t("discoverPage.counts", { verified: counters.verified ?? 0, possible: counters.possible ?? 0, asked: s.target_count })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_BADGE[s.status] ?? "outline"}>{s.status in STATUS_BADGE ? t(`discoverPage.status_${s.status}` as MessageKey) : s.status}</Badge>
                <form action={runSearchAgain}>
                  <input type="hidden" name="id" value={s.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    {t("discoverPage.runAgain")}
                  </Button>
                </form>
                <Link href={`/discover?q=${encodeURIComponent(s.original_query)}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  {t("discoverPage.duplicate")}
                </Link>
                {criteria.success ? (
                  <Link href={`/discover?from=${s.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    {t("discoverPage.modify")}
                  </Link>
                ) : null}
                <form action={deleteSearch}>
                  <input type="hidden" name="id" value={s.id} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={t("discoverPage.deleteSearch", { query: s.original_query })} title={t("discoverPage.deleteSearch", { query: s.original_query })}>
                    {t("discoverPage.delete")}
                  </Button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
