import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * The top of a page: an optional way back, the title, one line on what the page is for,
 * and the page's actions. A rule underneath separates it from the content.
 */
export function PageHeader({ title, description, actions, back, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; meta?: ReactNode }) {
  return (
    <header className="grid gap-4 border-b pb-5 md:flex md:items-end md:justify-between">
      <div className="grid min-w-0 gap-1.5">
        {back ? (
          <Link href={back.href} className="flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft aria-hidden className="size-4" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {meta ? <div className="text-sm text-muted-foreground">{meta}</div> : null}
        {description ? <p className="max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
