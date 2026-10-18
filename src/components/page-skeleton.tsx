import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * What shows while a page's data loads: card-shaped blocks where the content will be, so the page looks like it is
 * arriving rather than missing. Announced once to screen readers through the hidden label.
 */
export function PageSkeleton({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" className="grid gap-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} aria-hidden className="motion-reduce:*:animate-none">
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </CardHeader>
          <CardContent className="grid gap-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
