import { getT } from "@/lib/i18n/server";
import { ArrowRight } from "lucide-react";
import type { Comparison } from "@/lib/job-postings/compare";

/**
 * What tailoring changed and why the numbers moved. Both numbers are computed the same
 * way from the original and the tailored version; nothing here is an estimate.
 */
export async function ComparisonPanel({ c }: { c: Comparison }) {
  const t = await getT();
  return (
    <section aria-label={t("msg.whatChangedad0b")} className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <Measure label={t("msg.keywordMatch54b7")} before={c.keywordMatch.before} after={c.keywordMatch.after} hint={t("msg.howProminentlyThePosting491d")} />
        <Measure label={t("msg.requirementMatch6f48")} before={c.requirementMatch.before} after={c.requirementMatch.after} hint={t("msg.requirementsYourContentMeetsf954")} />
      </div>
      <ul className="grid list-disc gap-1 pl-5">
        {c.explanation.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        {c.keywordsSurfaced.length ? (
          <p>
            <span className="font-medium">{t("msg.keywordsEmphasized2872")}</span>
            {c.keywordsSurfaced.join(", ")}
          </p>
        ) : null}
        {c.requirementsMatched.length ? (
          <p>
            <span className="font-medium">{t("msg.requirementsMatched12cd")}</span>
            {c.requirementsMatched.slice(0, 8).join("; ")}
          </p>
        ) : null}
      </div>
      {c.missingRequirements.length ? (
        <div className="grid gap-1">
          <p className="font-medium">{t("msg.missingRequirementsfba2")}</p>
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

async function Measure({ label, before, after, hint }: { label: string; before: number; after: number; hint: string }) {
  const t = await getT();
  return (
    <div className="grid gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="flex items-center gap-2 text-lg font-semibold tabular-nums" aria-label={t("jobDetail.measureAria", { label, before, after })}>
        <span>{t("jobDetail.beforePct", { n: before })}</span>
        <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
        <span className={after > before ? "text-success" : after < before ? "text-warning" : undefined}>{t("jobDetail.afterPct", { n: after })}</span>
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
