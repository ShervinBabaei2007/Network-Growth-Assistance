import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A styled native <select>; it always submits with plain forms and works before hydration. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
