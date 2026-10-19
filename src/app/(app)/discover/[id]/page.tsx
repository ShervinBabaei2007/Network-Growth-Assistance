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
import { runSearchAgain } from "../../people/actions";

export const metadata = { title: "Research results · Network Growth" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function SearchPage({ params, searchParams }: PageProps<"/discover/[id]">) {
  return (
    <div className="grid gap-6">
      <Link href="/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Discover
      </Link>
      <Suspense fallback={<PageSkeleton label="Loading…" />}>
        <SearchBody params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchBody({ params, searchParams }: PageProps<"/discover/[id]">) {
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
          {view.parseNote ? <p className="text-xs text-muted-foreground">Request read with the built-in parser ({view.parseNote}).</p> : null}
        </div>
        {!running ? (
          <div className="flex flex-wrap gap-2">
            <form action={runSearchAgain}>
              <input type="hidden" name="id" value={view.id} />
              <Button type="submit" variant="outline" size="sm">
                Run again
              </Button>
            </form>
            {view.criteria ? (
              <Link href={`/discover?from=${view.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Modify search
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <SearchProgress key={view.status === "completed" ? "done" : "live"} initial={view} />

      {results.total > 0 ? <Filters sp={sp} /> : null}

      <Results view={view} results={results} filtering={filtering} />
    </>
  );
}

function Filters({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const text = (id: string, label: string, placeholder?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${id}`}>{label}</Label>
      <Input id={`f-${id}`} name={id} defaultValue={one(sp[id])} placeholder={placeholder} />
    </div>
  );
  return (
    <Disclosure summary="Filter results" open={["institution", "program", "company", "role", "location", "gradYear", "minScore", "connection", "confidence"].some((k) => one(sp[k]))}>
      <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {text("institution", "Institution")}
        {text("program", "Program")}
        {text("company", "Company")}
        {text("role", "Role")}
        {text("location", "Location")}
        {text("gradYear", "Graduation year", "e.g. 2023")}
        <div className="grid gap-1.5">
          <Label htmlFor="f-minScore">Minimum score</Label>
          <Input id="f-minScore" name="minScore" type="number" min={0} max={100} defaultValue={one(sp.minScore)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-connection">Connection status</Label>
          <AppSelect id="f-connection" name="connection" defaultValue={one(sp.connection)}>
            <option value="">All</option>
            {Object.entries(PROXIMITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </AppSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-confidence">Evidence confidence</Label>
          <AppSelect id="f-confidence" name="confidence" defaultValue={one(sp.confidence)}>
            <option value="">Any</option>
            <option value="high">High</option>
            <option value="medium">Medium or better</option>
          </AppSelect>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm">
            Apply
          </Button>
          <Link href="?" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Clear
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

function Results({ view, results, filtering }: { view: SearchView; results: SearchResults; filtering: boolean }) {
  const running = view.status === "queued" || view.status === "running";
  const finished = !running;
  const { verified, possible, review, hidden, rejected } = results;

  return (
    <section aria-labelledby="results-heading" className="grid gap-4">
      <h2 id="results-heading" className="text-base font-semibold">
        {verified.length} verified match{verified.length === 1 ? "" : "es"}
        {possible.length ? ` · ${possible.length} possible` : ""}
        {finished && verified.length < view.targetCount && verified.length > 0 ? (
          <span className="block text-sm font-normal text-muted-foreground">
            You asked for {view.targetCount}. Verified means every part of your request is stated in a public source we quote. Check before you contact.
          </span>
        ) : null}
      </h2>

      {finished && verified.length === 0 ? (
        <div className="grid gap-2 rounded-lg border bg-card p-6 text-sm">
          <p className="font-medium">{filtering ? "No verified matches with these filters." : "No strong matches yet."}</p>
          {!filtering ? (
            <>
              <p className="text-muted-foreground">
                The research found {results.total} {results.total === 1 ? "person" : "people"}
                {view.criteria?.education.institution ? ` linked to ${view.criteria.education.institution}` : ""}, but couldn&apos;t confidently verify every criterion
                for any of them.
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
        title="Possibly already connected: please review"
        count={review.length}
        open
        hint="These people look like someone in your known connections, but not certainly. Your answer is remembered for future searches."
      >
        <CardList people={review} searchId={view.id} review />
      </Group>

      <Group
        title="Include lower-confidence matches"
        count={possible.length}
        open={verified.length === 0 && finished}
        hint="Some criteria are backed only by weaker evidence (for example only a short form of the school, or no public mention of their current role). Check the evidence before reaching out."
      >
        <CardList people={possible} searchId={view.id} />
      </Group>

      <Group title="Hidden: likely already in your connections" count={hidden.length} hint="Matched your imported 1st-degree connections with high confidence.">
        <ul className="grid gap-1 text-sm">
          {hidden.map((p) => (
            <li key={p.personId}>
              {p.fullName}
              {p.knownConnectionName ? <span className="text-muted-foreground"> · matches {p.knownConnectionName}</span> : null}
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Found but didn't qualify" count={rejected.length} hint="Shown for transparency: the evidence didn't support the request, or you marked them not relevant.">
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
