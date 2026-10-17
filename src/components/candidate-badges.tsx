import { Badge } from "@/components/ui/badge";
import { disciplineName, STATUS_LABELS, universityName, type CandidateStatus, type Catalog, type Discipline, type University } from "@/lib/domain";

const STATUS_VARIANT: Partial<Record<CandidateStatus, "default" | "secondary" | "outline" | "destructive">> = {
  approved: "default",
  connected: "secondary",
  not_a_match: "outline",
  do_not_contact: "destructive",
};

export function StatusBadge({ status }: { status: CandidateStatus }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{STATUS_LABELS[status]}</Badge>;
}

/** School and program, with "?" and a review hint when either is unconfirmed. */
export function CategoryLabel({
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
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span>
        {university ? universityName(catalog, university) : "?"} · {discipline ? disciplineName(catalog, discipline) : "?"}
      </span>
      {confirmed ? null : <Badge variant="outline">Needs review</Badge>}
    </span>
  );
}
