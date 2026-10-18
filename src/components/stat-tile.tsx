import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: number | string | null;
  hint?: string;
  className?: string;
}) {
  return (
    <Card size="sm" className={cn("gap-0 py-3", className)}>
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-semibold tabular-nums", typeof value === "string" ? "text-lg leading-snug" : "text-2xl")}>
          {value === null ? <span className="text-muted-foreground">—</span> : formatValue(value)}
        </p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function formatValue(value: number | string) {
  return typeof value === "number" ? value.toLocaleString("en-CA") : value;
}
