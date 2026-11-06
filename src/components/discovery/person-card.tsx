import { getT } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { PROXIMITY_LABELS } from "@/lib/discovery/labels";
import type { PersonCard as Card } from "@/lib/discovery/results";
import { cn } from "@/lib/utils";
import { CardActions, KnownMatchReview } from "./card-actions";

/** One researched person: why they match, why connect, and what the evidence is. */
export async function PersonCard({ person: p, searchId, review = false }: { person: Card; searchId: string; review?: boolean }) {
  const t = await getT();
  const role = [p.currentTitle, p.currentCompany].filter(Boolean).join(" @ ");
  const education = [p.institution, p.program, p.gradYear ? `’${p.gradYear.slice(2)}` : null].filter(Boolean).join(" · ");
  return (
    <article aria-labelledby={`p-${p.personId}`} className="grid gap-3 rounded-lg border bg-card p-4 text-card-foreground">
      <header className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h3 id={`p-${p.personId}`} className="truncate text-base font-semibold">
            {p.fullName}
          </h3>
          {role ? <p className="text-sm">{role}</p> : null}
          {education ? <p className="text-sm text-muted-foreground">{education}</p> : null}
          {p.location ? <p className="text-xs text-muted-foreground">{p.locationFrom === "employer" ? `Employer's office: ${p.location}` : p.location}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className={cn("rounded-md px-2 py-1 text-sm font-semibold tabular-nums", p.relevance >= 80 ? "bg-primary text-primary-foreground" : "bg-muted")}>
            {p.relevance} <span className="text-xs font-normal">{t("msg.matche3cc")}</span>
          </p>
          {p.saved ? <Badge variant="secondary">{t("msg.saved2483")}</Badge> : null}
        </div>
      </header>

      <div className="grid gap-1">
        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("msg.whyThisMatches64e5")}</h4>
        <ul className="grid gap-0.5 text-sm">
          {p.reasons.map((r) => (
            <li key={r} className={r.startsWith("✓") ? "" : "text-muted-foreground"}>
              {r}
            </li>
          ))}
          <li className={p.proximity === "not_connected" ? "" : "text-muted-foreground"}>
            {p.proximity === "not_connected" ? t("discCard.notInConnections") : t(`proximity.${p.proximity}` as "proximity.unknown")}
          </li>
        </ul>
        {p.possibleDuplicateOf ? <p className="text-xs text-muted-foreground">{t("msg.possibleDuplicateOfAnother02ac")}</p> : null}
      </div>

      {p.reasonForConnecting ? (
        <div className="grid gap-1">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("msg.whyConnect7e49")}</h4>
          <p className="text-sm">“{p.reasonForConnecting}”</p>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {p.sourceCount} public source{p.sourceCount === 1 ? "" : "s"}{p.sourceNames.length ? ` (${p.sourceNames.join(", ")})` : ""} · {p.confidence}% evidence confidence
        {p.tier === "possible" && p.tierReason ? ` · ${p.tierReason}` : ""}
      </p>

      {review ? <KnownMatchReview personId={p.personId} name={p.knownConnectionName} confidence={p.knownMatchConfidence} /> : null}
      <CardActions person={p} searchId={searchId} />
    </article>
  );
}
