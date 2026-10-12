import { ArrowRight } from "lucide-react";
import type { Comparison } from "@/lib/job-postings/compare";

/**
 * What tailoring changed and why the numbers moved. Both numbers are computed the same
 * way from the original and the tailored version; nothing here is an estimate.
 */
export function ComparisonPanel({ c }: { c: Comparison }) {
  return (
    <section aria-label="What changed" className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <Measure label="Keyword match" before={c.keywordMatch.before} after={c.keywordMatch.after} hint="How prominently the posting's key terms appear" />
        <Measure label="Requirement match" before={c.requirementMatch.before} after={c.requirementMatch.after} hint="Requirements your content meets, by the fit rules" />
      </div>
      <ul className="grid list-disc gap-1 pl-5">
        {c.explanation.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        {c.keywordsSurfaced.length ? (
          <p>
            <span className="font-medium">Keywords emphasized: </span>
            {c.keywordsSurfaced.join(", ")}
          </p>
        ) : null}
        {c.requirementsMatched.length ? (
          <p>
            <span className="font-medium">Requirements matched: </span>
            {c.requirementsMatched.slice(0, 8).join("; ")}
          </p>
        ) : null}
      </div>
      {c.missingRequirements.length ? (
        <div className="grid gap-1">
          <p className="font-medium">Missing requirements</p>
          <ul className="grid gap-0.5">
            {c.missingRequirements.map((m) => (
              <li key={m.text} className="text-muted-foreground">
                Missing {m.kind === "must" ? "requirement" : "preferred qualification"}: {m.text}. It was not found in your resume, so it wasn&apos;t added.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Measure({ label, before, after, hint }: { label: string; before: number; after: number; hint: string }) {
  return (
    <div className="grid gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="flex items-center gap-2 text-lg font-semibold tabular-nums" aria-label={`${label}: ${before}% before, ${after}% after`}>
        <span>Before {before}%</span>
        <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
        <span className={after > before ? "text-success" : after < before ? "text-warning" : undefined}>After {after}%</span>
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
