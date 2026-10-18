import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A collapsible section in the shadcn style: a bordered card with a chevron ("card"), or a quiet inline toggle ("plain").
 * Built on a native <details>, so it opens and closes with the keyboard, works before any JavaScript has loaded and
 * can sit inside server-rendered pages and plain forms.
 */
export function Disclosure({
  summary,
  children,
  open,
  variant = "card",
  className,
  ...props
}: {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
  variant?: "card" | "plain";
  className?: string;
} & Omit<React.ComponentProps<"details">, "children" | "open" | "className">) {
  const card = variant === "card";
  return (
    <details open={open} data-slot="disclosure" className={cn("group text-sm", card && "rounded-lg border bg-card", className)} {...props}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden",
          card ? "min-h-11 px-3 py-2 font-medium hover:bg-muted/50 md:min-h-10" : "w-fit min-h-9 py-1 text-muted-foreground hover:text-foreground md:min-h-7",
        )}
      >
        <span className="min-w-0">{summary}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className={cn(card ? "border-t px-3 py-3" : "pt-2")}>{children}</div>
    </details>
  );
}
