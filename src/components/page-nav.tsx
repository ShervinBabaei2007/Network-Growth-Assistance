import { getT } from "@/lib/i18n/server";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

/** Pages near the current one, plus the first and last, with gaps marked. */
function windowOf(current: number, pages: number): (number | "gap")[] {
  const keep = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - current) <= 2);
  return keep.flatMap((n, i) => (i > 0 && n - keep[i - 1] > 1 ? (["gap", n] as const) : [n]));
}

/** Previous / numbered pages / Next, on the shadcn Pagination. `href` builds the address of a page number. */
export async function PageNav({ current, pages, href, label }: { current: number; pages: number; href: (page: number) => string; label?: string }) {
  if (pages <= 1) return null;
  const t = await getT();
  return (
    <Pagination aria-label={label ?? t("list.pages")}>
      <PaginationContent>
        {current > 1 ? (
          <PaginationItem>
            <PaginationPrevious href={href(current - 1)} text={t("list.previous")} aria-label={t("list.previous")} />
          </PaginationItem>
        ) : null}
        {windowOf(current, pages).map((n, i) =>
          n === "gap" ? (
            <PaginationItem key={`gap-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={n}>
              <PaginationLink href={href(n)} isActive={n === current} aria-label={t("list.page", { n })}>
                {n}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        {current < pages ? (
          <PaginationItem>
            <PaginationNext href={href(current + 1)} text={t("list.next")} aria-label={t("list.next")} />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}
