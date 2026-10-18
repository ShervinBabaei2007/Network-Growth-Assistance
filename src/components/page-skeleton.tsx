/**
 * What shows while a page's data loads: block shapes where the content will be, so the page looks like it is
 * arriving rather than missing. Announced once to screen readers through the hidden label.
 */
export function PageSkeleton({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" className="grid gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="h-28 animate-pulse rounded-xl border bg-muted/40 motion-reduce:animate-none" />
      ))}
    </div>
  );
}
