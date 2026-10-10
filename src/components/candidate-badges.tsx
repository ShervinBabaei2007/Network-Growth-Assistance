import { Badge } from "@/components/ui/badge";
import {
  DISCIPLINE_LABELS,
  SHORT_UNIVERSITY,
  STATUS_LABELS,
  type CandidateStatus,
  type Discipline,
  type University,
} from "@/lib/domain";

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
}: {
  university: University | null;
  discipline: Discipline | null;
  confirmed: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span>
        {university ? SHORT_UNIVERSITY[university] : "?"} ·{" "}
        {discipline ? DISCIPLINE_LABELS[discipline] : "?"}
      </span>
      {confirmed ? null : <Badge variant="outline">Needs review</Badge>}
    </span>
  );
}
