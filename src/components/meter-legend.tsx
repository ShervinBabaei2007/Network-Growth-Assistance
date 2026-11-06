import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/** The key to the progress bars: accepted, and pending which is never counted. */
export async function MeterLegend({ className }: { className?: string }) {
  const t = await getT();
  return (
    <p className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-meter-fill" aria-hidden /> {t("meter.accepted")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-meter-pending bg-(image:--meter-stripes)" aria-hidden /> {t("meter.pendingNotCounted")}
      </span>
    </p>
  );
}
