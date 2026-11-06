import { LocaleScope } from "@/components/locale-scope";
import { Suspense, type ReactNode } from "react";
import { Disclosure } from "@/components/disclosure";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PersonCard } from "@/components/discovery/person-card";
import { SearchProgress } from "@/components/discovery/search-progress";
import { AppSelect } from "@/components/app-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyAdvice } from "@/lib/discovery/advice";
import { describeCriteria } from "@/lib/discovery/criteria";
import { PROXIMITY_LABELS } from "@/lib/discovery/labels";
import { loadSearchResults, type PersonCard as Card, type ResultFilters, type SearchResults } from "@/lib/discovery/results";
import { loadSearchView, type SearchView } from "@/lib/discovery/service";
import { createClient } from "@/lib/supabase/server";
import { Tx } from "@/components/tx";
import { getT } from "@/lib/i18n/server";
import { runSearchAgain } from "../../people/actions";

export const metadata = { title: "Research results · Network Growth" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function SearchPage({ params, searchParams }: PageProps<"/discover/[id]">) {
  return (
    <div className="grid gap-6">
      <Link href="/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> <Tx k="pages.discover.title" />
      </Link>
      <Suspense fallback={<PageSkeleton labelKey="loading.generic" />}>
        <SearchBody params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchBody({ params, searchParams }: PageProps<"/discover/[id]">) {
  const t = await getT();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const view = await loadSearchView(supabase, id);
  if (!view) notFound();

  const filters: ResultFilters = {
    institution: one(sp.institution) || undefined,
    program: one(sp.program) || undefined,
    company: one(sp.company) || undefined,
    role: one(sp.role) || undefined,
    location: one(sp.location) || undefined,
    gradYear: one(sp.gradYear) || undefined,
    minScore: Number(one(sp.minScore)) || 0,
    connection: (one(sp.connection) as ResultFilters["connection"]) || "",
    confidence: (one(sp.confidence) as ResultFilters["confidence"]) || "",
  };
  const results = await loadSearchResults(supabase, id, filters);
  const filtering = Object.values(filters).some(Boolean);
  const running = view.status === "queued" || view.status === "running";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-xl font-semibold">{view.query}</h1>
          {view.criteria ? <p className="text-sm text-muted-foreground">{describeCriteria(view.criteria)}</p> : null}
          {view.parseNote ? <p className="text-xs text-muted-foreground">{t("researchPage.parser", { note: view.parseNote })}</p> : null}
        </div>
        {!running ? (
          <div className="flex flex-wrap gap-2">
            <form action={runSearchAgain}>
              <input type="hidden" name="id" value={view.id} />
              <Button type="submit" variant="outline" size="sm">
                {t("discoverPage.runAgain")}
              </Button>
            </form>
            {view.criteria ? (
              <Link href={`/discover?from=${view.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("discoverPage.modifyTitle")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <LocaleScope groups={["msg", "ui", "crm", "proximity"]}>
        <SearchProgress key={view.status === "completed" ? "done" : "live"} initial={view} />

        {results.total > 0 ? <Filters sp={sp} /> : null}

        <Results view={view} results={results} filtering={filtering} />
      </LocaleScope>
    </>
  );
}

async function Filters({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const t = await getT();
  const text = (id: string, label: string, placeholder?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${id}`}>{label}</Label>
      <Input id={`f-${id}`} name={id} defaultValue={one(sp[id])} placeholder={placeholder} />
    </div>
  );
  return (
    <Disclosure summary={t("researchPage.filterResults")} open={["institution", "program", "company", "role", "location", "gradYear", "minScore", "connection", "confidence"].some((k) => one(sp[k]))}>
      <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {text("institution", t("researchPage.institution"))}
        {text("program", t("researchPage.program"))}
        {text("company", t("connectionsPage.company"))}
        {text("role", t("list.role"))}
        {text("location", t("researchPage.location"))}
        {text("gradYear", t("candidatesPage.gradYear"), t("researchPage.gradExample"))}
        <div className="grid gap-1.5">
          <Label htmlFor="f-minScore">{t("researchPage.minScore")}</Label>
          <Input id="f-minScore" name="minScore" type="number" min={0} max={100} defaultValue={one(sp.minScore)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-connection">{t("researchPage.connectionStatus")}</Label>
          <AppSelect id="f-connection" name="connection" defaultValue={one(sp.connection)}>
            <option value="">{t("list.all")}</option>
            {Object.keys(PROXIMITY_LABELS).map((v) => (
              <option key={v} value={v}>
                {t(`proximity.${v}` as "proximity.unknown")}
              </option>
            ))}
          </AppSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-confidence">{t("researchPage.confidence")}</Label>
          <AppSelect id="f-confidence" name="confidence" defaultValue={one(sp.confidence)}>
            <option value="">{t("researchPage.any")}</option>
            <option value="high">{t("researchPage.high")}</option>
            <option value="medium">{t("researchPage.mediumPlus")}</option>
          </AppSelect>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm">
            {t("researchPage.apply")}
          </Button>
          <Link href="?" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t("list.clear")}
          </Link>
        </div>
      </form>
    </Disclosure>
  );
}

function CardList({ people, searchId, review }: { people: Card[]; searchId: string; review?: boolean }) {
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {people.map((p) => (
        <li key={p.personId}>
          <PersonCard person={p} searchId={searchId} review={review} />
        </li>
      ))}
    </ul>
  );
}

function Group({ title, count, children, open = false, hint }: { title: string; count: number; children: ReactNode; open?: boolean; hint?: string }) {
  if (count === 0) return null;
  return (
    <Disclosure summary={`${title} (${count})`} open={open}>
      {hint ? <p className="mb-3 text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </Disclosure>
  );
}

async function Results({ view, results, filtering }: { view: SearchView; results: SearchResults; filtering: boolean }) {
  const t = await getT();
  const running = view.status === "queued" || view.status === "running";
  const finished = !running;
  const { verified, possible, review, hidden, rejected } = results;

  return (
    <section aria-labelledby="results-heading" className="grid gap-4">
      <h2 id="results-heading" className="text-base font-semibold">
        {verified.length === 1 ? t("researchPage.verifiedOne") : t("researchPage.verifiedMany", { count: verified.length })}
        {possible.length ? t("researchPage.possibleCount", { count: possible.length }) : ""}
        {finished && verified.length < view.targetCount && verified.length > 0 ? (
          <span className="block text-sm font-normal text-muted-foreground">
            {t("researchPage.askedFor", { count: view.targetCount })}
          </span>
        ) : null}
      </h2>

      {finished && verified.length === 0 ? (
        <div className="grid gap-2 rounded-lg border bg-card p-6 text-sm">
          <p className="font-medium">{filtering ? t("researchPage.noneFiltered") : t("researchPage.noneYet")}</p>
          {!filtering ? (
            <>
              <p className="text-muted-foreground">
                {t(results.total === 1 ? "researchPage.foundOne" : "researchPage.foundMany", { count: results.total })}
                {view.criteria?.education.institution ? t("researchPage.linkedTo", { institution: view.criteria.education.institution }) : ""}{t("researchPage.couldntVerify")}
              </p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {emptyAdvice(view.criteria, [...results.rejected, ...results.possible], results.possible.length).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {verified.length ? <CardList people={verified} searchId={view.id} /> : null}

      <Group
        title={t("researchPage.reviewTitle")}
        count={review.length}
        open
        hint={t("researchPage.reviewHint")}
      >
        <CardList people={review} searchId={view.id} review />
      </Group>

      <Group
        title={t("researchPage.lowerTitle")}
        count={possible.length}
        open={verified.length === 0 && finished}
        hint={t("researchPage.lowerHint")}
      >
        <CardList people={possible} searchId={view.id} />
      </Group>

      <Group title={t("researchPage.hiddenTitle")} count={hidden.length} hint={t("researchPage.hiddenHint")}>
        <ul className="grid gap-1 text-sm">
          {hidden.map((p) => (
            <li key={p.personId}>
              {p.fullName}
              {p.knownConnectionName ? <span className="text-muted-foreground">{t("researchPage.matches", { name: p.knownConnectionName })}</span> : null}
            </li>
          ))}
        </ul>
      </Group>

      <Group title={t("researchPage.rejectedTitle")} count={rejected.length} hint={t("researchPage.rejectedHint")}>
        <ul className="grid gap-1 text-sm">
          {rejected.map((p) => (
            <li key={p.personId}>
              {p.fullName}
              <span className="text-muted-foreground"> · {p.tierReason}</span>
            </li>
          ))}
        </ul>
      </Group>
    </section>
  );
}
