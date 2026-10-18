import { Suspense } from "react";
import { Disclosure } from "@/components/disclosure";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader title="Network discovery" description="Describe who you'd like to meet and get matches from public sources, each with a reason." />

      <Suspense fallback={null}>
        <RequestCard searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<PageSkeleton label="Loading your searches…" />}>
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{modify.data ? "Modify search" : "Who would you like to meet?"}</CardTitle>
          {modify.data ? <CardDescription>Started from “{modify.data.original_query}”. Change any criterion and run it as a new search.</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          {modify.data && modifyCriteria?.success ? (
            <CriteriaEditor query={modify.data.original_query} criteria={modifyCriteria.data} parentSearchId={modify.data.id} />
          ) : (
            <DiscoverForm initialQuery={one(params.q)} error={one(params.error) || undefined} />
          )}
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {(known ?? 0) > 0 ? (
              <li>{(known ?? 0).toLocaleString("en-CA")} known connections will be left out of results.</li>
            ) : (
              <li>
                <Link href="/connections" className="underline underline-offset-4">
                  Import your connections
                </Link>{" "}
                first so people you already know are left out.
              </li>
            )}
          </ul>
          {/* Not shown: lets the e2e specs tell whether the dev server runs with fixture sources. */}
          <span hidden data-testid="discovery-sources">
            Sources: {discoveryStatus().providers.join(", ")}
          </span>
        </CardContent>
      </Card>

      <Disclosure summary="Your networking goal">
            <ActionForm action={saveNetworkingGoal} submitLabel="Save">
              <div className="grid gap-1.5">
                <Label htmlFor="goal">What are you looking for?</Label>
                <Input id="goal" name="goal" maxLength={300} defaultValue={settings?.networking_goal ?? ""} placeholder="e.g. what you&apos;re hoping to learn, or the kind of role you&apos;re working toward" />
                <p className="text-xs text-muted-foreground">Used to rank people by how useful a conversation would be, and to word suggested intros. It isn&apos;t shared.</p>
              </div>
            </ActionForm>
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

  return (
    <section aria-labelledby="history-heading" className="grid gap-3">
      <h2 id="history-heading" className="text-base font-semibold">
        Search history
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
                  {new Date(s.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                  {criteria.success ? ` · ${describeCriteria(criteria.data)}` : ""}
                  {" · "}
                  {counters.verified ?? 0} verified, {counters.possible ?? 0} possible of {s.target_count} asked
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_BADGE[s.status] ?? "outline"}>{s.status}</Badge>
                <form action={runSearchAgain}>
                  <input type="hidden" name="id" value={s.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Run again
                  </Button>
                </form>
                <Link href={`/discover?q=${encodeURIComponent(s.original_query)}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Duplicate
                </Link>
                {criteria.success ? (
                  <Link href={`/discover?from=${s.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    Modify
                  </Link>
                ) : null}
                <form action={deleteSearch}>
                  <input type="hidden" name="id" value={s.id} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={`Delete search “${s.original_query}”`} title={`Delete search “${s.original_query}”`}>
                    Delete
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
