import { cn } from "@/lib/utils";

const pct = (value: number, target: number) =>
  target <= 0 ? 100 : Math.max(0, Math.min(100, (value / target) * 100));

/**
 * Accepted connections against a target, with pending invitations as a lighter
 * segment of the same ramp. Pending is never part of the meter's value.
 */
export function ProgressMeter({
  label,
  accepted,
  pending = 0,
  target,
  valueText,
  className,
}: {
  label: string;
  accepted: number;
  pending?: number;
  target: number;
  /** The reading for screen readers, in the page's language. Defaults to English. */
  valueText?: string;
  className?: string;
}) {
  const acceptedPct = pct(accepted, target);
  const pendingPct = Math.min(100 - acceptedPct, pct(pending, target));
  const pendingText = pending ? `, ${pending} pending` : "";

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={Math.min(accepted, target)}
      aria-valuetext={valueText ?? `${accepted} of ${target} accepted${pendingText}`}
      className={cn("flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-meter-track", className)}
    >
      {acceptedPct > 0 ? (
        <div className="h-full rounded-full bg-meter-fill" style={{ width: `${acceptedPct}%` }} />
      ) : null}
      {pendingPct > 0 ? (
        <div className="h-full rounded-full bg-meter-pending bg-(image:--meter-stripes)" style={{ width: `${pendingPct}%` }} />
      ) : null}
    </div>
  );
}
