"use client";

import { useTr } from "@/lib/i18n/client";
import { Disclosure } from "@/components/disclosure";
import { FormError } from "@/components/form-error";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Circle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_LABELS } from "@/lib/discovery/labels";
import type { SearchView } from "@/lib/discovery/service";
import { cn } from "@/lib/utils";

const VISIBLE_STAGES = ["understanding", "planning", "searching", "verifying", "checking_connections", "ranking", "explaining"] as const;
const POLL_MS = 1500;

/**
 * Live progress from the server. Each poll also lets the server run the next
 * bounded research step, so these stages are real, not timers.
 */
export function SearchProgress({ initial }: { initial: SearchView }) {
  const tr = useTr();
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const lastFound = useRef(initial.counters.found ?? 0);
  const running = view.status === "queued" || view.status === "running";

  useEffect(() => {
    if (!running) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/network/searches/${view.id}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const next = (await res.json()) as SearchView;
        if (stop) return;
        setView(next);
        setError(null);
        // Show people as they're found, and the final ranking when done.
        const found = next.counters.found ?? 0;
        if (found !== lastFound.current || (next.status !== "running" && next.status !== "queued")) {
          lastFound.current = found;
          router.refresh();
        }
      } catch {
        if (!stop) setError(tr("msg.lostContactWithThe711a", "Lost contact with the server; retrying…"));
      }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, 300);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [running, view.id, router, tr]);

  const cancel = async () => {
    setCancelling(true);
    await fetch(`/api/network/searches/${view.id}`, { method: "DELETE" }).catch(() => undefined);
    setView({ ...view, status: "cancelled" });
    setCancelling(false);
    router.refresh();
  };

  const c = view.counters;
  const m = view.metrics;
  // Finished with nobody found: say why, instead of tr("msg.researchComplete4f90", "Research complete") over a row of ticks.
  const empty = !running && view.status === "completed" && (c.verified ?? 0) + (c.possible ?? 0) === 0;
  const emptyNote = !empty
    ? null
    : !m.queries
      ? view.parseNote
        ? tr("msg.theServiceThatReads0331", "The service that reads your request was unavailable, so details such as your school may have been missed. Try again in a minute.")
        : tr("msg.noSearchesCouldBe0070", "No searches could be run for this request. Add a school, a city or a company and try again.")
      : m.providerFailures
        ? tr("msg.someSourcesWereBusy648b", "Some sources were busy or unavailable. Try again in a little while.")
        : tr("msg.nothingInThePublicd001", "Nothing in the public sources matched. Try fewer requirements, or name a school, city or company.");
  // The narrowest ORCID search says how many people the public registry holds for this request.
  const narrowest = [...(m.coverage ?? [])].sort((a, b) => a.total - b.total || b.label.length - a.label.length)[0];
  const coverageNote = !running && narrowest ? `ORCID lists ${narrowest.total.toLocaleString("en-CA")} ${narrowest.total === 1 ? "person" : "people"} matching ${narrowest.label}.` : null;
  const current = VISIBLE_STAGES.indexOf(view.stage as (typeof VISIBLE_STAGES)[number]);

  return (
    <section aria-labelledby="progress-heading" className="grid gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="progress-heading" className="text-sm font-semibold">
          {running ? tr("msg.researching08bd", "Researching…") : view.status === "completed" ? (empty ? tr("msg.noMatchesFoundd132", "No matches found") : tr("msg.researchComplete4f90", "Research complete")) : view.status === "cancelled" ? tr("msg.searchCancelledc33e", "Search cancelled") : tr("msg.searchStoppedb329", "Search stopped")}
        </h2>
        {running ? (
          <Button variant="outline" size="sm" onClick={cancel} disabled={cancelling}>
            {cancelling ? tr("msg.cancelling9bdc", "Cancelling…") : tr("msg.cancelea47", "Cancel")}
          </Button>
        ) : null}
      </div>

      <ol className="grid gap-1.5 text-sm" aria-live="polite">
        {VISIBLE_STAGES.map((s, i) => {
          const skipped = s === "explaining" && !view.aiEnabled;
          const done = !skipped && (!running ? view.status === "completed" || i < current : i < current);
          const active = !skipped && running && i === current;
          return (
            <li key={s} className={cn("flex items-center gap-2", !done && !active && "text-muted-foreground")}>
              {done ? <Check className="size-4 text-primary" aria-hidden /> : active ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Circle className="size-4" aria-hidden />}
              <span>
                {STAGE_LABELS[s]}
                {s === "searching" && (c.found ?? 0) > 0 ? ` · found ${c.found} possible ${c.found === 1 ? "person" : "people"}` : ""}
                {s === "checking_connections" && done && (c.hiddenConnected ?? 0) > 0 ? ` · ${c.hiddenConnected} already connected` : ""}
                {skipped ? " · skipped (AI is off; scores and reasons are still shown)" : ""}
              </span>
              <span className="sr-only">{done ? "(done)" : active ? "(in progress)" : skipped ? "" : "(waiting)"}</span>
            </li>
          );
        })}
      </ol>

      <p className="text-sm">
        <strong>{c.verified ?? 0}</strong> verified · <strong>{c.possible ?? 0}</strong> possible
        {c.needsReview ? ` · ${c.needsReview} to review` : ""} · asked for {view.targetCount}
      </p>
      {emptyNote ? <p className="text-sm">{emptyNote}</p> : null}
      {coverageNote ? <p className="text-xs text-muted-foreground">{coverageNote}</p> : null}
      {!running && !empty && view.status === "completed" && !m.llmCalls ? (
        <p className="text-xs text-muted-foreground">
          AI wasn&apos;t used for this search, so matches are scored from the evidence alone.{" "}
          <Link href="/settings" className="underline underline-offset-4">
            {tr("msg.addYourOwnFreeef51", "Add your own free AI key")}
          </Link>{" "}
          for written reasons.
        </p>
      ) : null}
      {view.stopReason && !running && !empty ? <p className="text-xs text-muted-foreground">Stopped because: {view.stopReason}.</p> : null}
      {view.error ? (
        <FormError>
          {view.error}
        </FormError>
      ) : null}
      {error ? <p className="text-xs text-muted-foreground">{error}</p> : null}

      <Disclosure variant="plain" summary={tr("msg.researchDetails34c7", "Research details")} className="text-xs">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-4">
          {[
            [tr("msg.queriesRunaec9", "Queries run"), m.queries],
            [tr("msg.resultsReadd30f", "Results read"), m.results],
            [tr("msg.pagesProcessed1aba", "Pages processed"), m.pages],
            [tr("msg.profilesReadGithubOrcid7b7e", "Profiles read (GitHub, ORCID)"), m.profiles],
            [tr("msg.aiCalls6aa1", "AI calls"), m.llmCalls],
            [tr("msg.tokensInOut84a5", "Tokens in / out"), m.inputTokens !== undefined ? `${m.inputTokens} / ${m.outputTokens}` : undefined],
            [tr("msg.cacheHits9c93", "Cache hits"), m.cacheHits],
            [tr("msg.providerFailuresde20", "Provider failures"), m.providerFailures],
            [tr("msg.unsupportedFactsDropped586d", "Unsupported facts dropped"), m.factsDropped],
            [tr("msg.linkedinResultsNotOpenedaf97", "LinkedIn results not opened"), m.linkedinResultsSkipped],
            [tr("msg.peopleConsidered8f96", "People considered"), m.candidatesConsidered],
            [tr("msg.duratione02d", "Duration"), m.durationMs !== undefined ? `${Math.round((m.durationMs ?? 0) / 1000)} s` : undefined],
            [tr("msg.requestReadByc258", "Request read by"), view.usedAi ? tr("msg.ai0a40", "AI") : tr("msg.builtInParser2f8c", "built-in parser")],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-2 sm:block">
              <dt>{label}</dt>
              <dd className="font-medium text-foreground tabular-nums">{value ?? 0}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>
    </section>
  );
}
