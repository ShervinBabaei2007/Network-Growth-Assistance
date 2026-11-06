import { Badge } from "@/components/ui/badge";
import { getT } from "@/lib/i18n/server";
import { disciplineName, universityName, type CandidateStatus, type Catalog, type Discipline, type University } from "@/lib/domain";

const STATUS_VARIANT: Partial<Record<CandidateStatus, "default" | "secondary" | "outline" | "destructive">> = {
  approved: "default",
  connected: "secondary",
  not_a_match: "outline",
  do_not_contact: "destructive",
};

export async function StatusBadge({ status }: { status: CandidateStatus }) {
  const t = await getT();
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{t(`status.${status}`)}</Badge>;
}

/** School and program, with "?" and a review hint when either is unconfirmed. */
export async function CategoryLabel({
  university,
  discipline,
  confirmed,
  catalog,
}: {
  university: University | null;
  discipline: Discipline | null;
  confirmed: boolean;
  /** The user's own schools and disciplines, for their names. */
  catalog: Catalog;
}) {
  const t = await getT();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span>
        {university ? universityName(catalog, university) : "?"} · {discipline ? disciplineName(catalog, discipline) : "?"}
      </span>
      {confirmed ? null : <Badge variant="outline">{t("list.needsReview")}</Badge>}
    </span>
  );
}
