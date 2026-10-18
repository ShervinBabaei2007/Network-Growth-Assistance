"use client";

import { Disclosure } from "@/components/disclosure";
import { FormError } from "@/components/form-error";
import { useEffect, useRef, useState } from "react";
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
        if (!stop) setError("Lost contact with the server; retrying…");
      }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, 300);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [running, view.id, router]);

  const cancel = async () => {
    setCancelling(true);
    await fetch(`/api/network/searches/${view.id}`, { method: "DELETE" }).catch(() => undefined);
    setView({ ...view, status: "cancelled" });
    setCancelling(false);
    router.refresh();
  };

  const c = view.counters;
  const m = view.metrics;
  const current = VISIBLE_STAGES.indexOf(view.stage as (typeof VISIBLE_STAGES)[number]);

  return (
    <section aria-labelledby="progress-heading" className="grid gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="progress-heading" className="text-sm font-semibold">
          {running ? "Researching…" : view.status === "completed" ? "Research complete" : view.status === "cancelled" ? "Search cancelled" : "Search stopped"}
        </h2>
        {running ? (
          <Button variant="outline" size="sm" onClick={cancel} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel"}
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
      {view.stopReason && !running ? <p className="text-xs text-muted-foreground">Stopped because: {view.stopReason}.</p> : null}
      {view.error ? (
        <FormError>
          {view.error}
        </FormError>
      ) : null}
      {error ? <p className="text-xs text-muted-foreground">{error}</p> : null}
      {view.limitations.length ? (
        <ul className="grid gap-0.5 text-xs text-muted-foreground">
          {view.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}

      <Disclosure variant="plain" summary="Research details" className="text-xs">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-4">
          {[
            ["Queries run", m.queries],
            ["Results read", m.results],
            ["Pages processed", m.pages],
            ["Profiles read (GitHub, ORCID)", m.profiles],
            ["AI calls", m.llmCalls],
            ["Tokens in / out", m.inputTokens !== undefined ? `${m.inputTokens} / ${m.outputTokens}` : undefined],
            ["Cache hits", m.cacheHits],
            ["Provider failures", m.providerFailures],
            ["Unsupported facts dropped", m.factsDropped],
            ["LinkedIn results not opened", m.linkedinResultsSkipped],
            ["People considered", m.candidatesConsidered],
            ["Duration", m.durationMs !== undefined ? `${Math.round((m.durationMs ?? 0) / 1000)} s` : undefined],
            ["Request read by", view.usedAi ? "AI" : "built-in parser"],
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
