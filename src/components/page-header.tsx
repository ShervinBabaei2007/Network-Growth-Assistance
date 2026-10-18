import type { ReactNode } from "react";
import Link from "next/link";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

/**
 * The top of a page: an optional breadcrumb back to where you came from, the title, one line on what the page is for,
 * and the page's actions. A rule underneath separates it from the content.
 */
export function PageHeader({ title, description, actions, back, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; meta?: ReactNode }) {
  return (
    <header className="grid gap-4 border-b pb-5 md:flex md:items-end md:justify-between">
      <div className="grid min-w-0 gap-1.5">
        {back ? (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={back.href} />} className="inline-flex min-h-9 items-center md:min-h-0">
                  {back.label}
                </BreadcrumbLink>
              </BreadcrumbItem>
              {typeof title === "string" ? (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage className="truncate">{title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : null}
            </BreadcrumbList>
          </Breadcrumb>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {meta ? <div className="text-sm text-muted-foreground">{meta}</div> : null}
        {description ? <p className="max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
