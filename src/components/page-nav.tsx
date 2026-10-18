import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

/** Pages near the current one, plus the first and last, with gaps marked. */
function windowOf(current: number, pages: number): (number | "gap")[] {
  const keep = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - current) <= 2);
  return keep.flatMap((n, i) => (i > 0 && n - keep[i - 1] > 1 ? (["gap", n] as const) : [n]));
}

/** Previous / numbered pages / Next, on the shadcn Pagination. `href` builds the address of a page number. */
export function PageNav({ current, pages, href, label = "Pages" }: { current: number; pages: number; href: (page: number) => string; label?: string }) {
  if (pages <= 1) return null;
  return (
    <Pagination aria-label={label}>
      <PaginationContent>
        {current > 1 ? (
          <PaginationItem>
            <PaginationPrevious href={href(current - 1)} />
          </PaginationItem>
        ) : null}
        {windowOf(current, pages).map((n, i) =>
          n === "gap" ? (
            <PaginationItem key={`gap-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={n}>
              <PaginationLink href={href(n)} isActive={n === current} aria-label={`Page ${n}`}>
                {n}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        {current < pages ? (
          <PaginationItem>
            <PaginationNext href={href(current + 1)} />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}
