import { Sparkline } from "@/components/progress-visuals";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  hint,
  trend,
  className,
}: {
  label: string;
  value: number | string | null;
  hint?: string;
  /** A daily series drawn as a small line beside the number. The number and hint still say everything. */
  trend?: number[];
  className?: string;
}) {
  return (
    <Card size="sm" className={cn("gap-0 py-3", className)}>
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-1 flex items-end justify-between gap-2">
          <p className={cn("font-semibold tabular-nums", typeof value === "string" ? "text-lg leading-snug" : "text-2xl")}>
            {value === null ? <span className="text-muted-foreground">—</span> : formatValue(value)}
          </p>
          {trend ? <Sparkline values={trend} /> : null}
        </div>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function formatValue(value: number | string) {
  return typeof value === "number" ? value.toLocaleString("en-CA") : value;
}
