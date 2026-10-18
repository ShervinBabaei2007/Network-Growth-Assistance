"use client"

import * as React from "react"
import { cn } from "cn"

/**
 * With `stack`, each row becomes a small card on phones (below md): the header row is hidden and every
 * cell that has a `label` shows it beside its value. Pure CSS, so the table stays a table on larger screens
 * and nothing extra is hydrated. Columns hidden on narrow screens with `hidden md:table-cell` appear in the card.
 */
const STACKED =
  "max-md:[&_thead]:hidden max-md:[&_tbody]:grid max-md:[&_tbody]:gap-2 " +
  "max-md:[&_tr]:grid max-md:[&_tr]:gap-1.5 max-md:[&_tr]:rounded-lg max-md:[&_tr]:border! max-md:[&_tr]:bg-card max-md:[&_tr]:p-3 " +
  "max-md:[&_td]:block max-md:[&_td]:max-w-none max-md:[&_td]:overflow-visible max-md:[&_td]:p-0 max-md:[&_td]:text-left max-md:[&_td]:whitespace-normal " +
  "max-md:[&_td[data-label]]:flex max-md:[&_td[data-label]]:items-baseline max-md:[&_td[data-label]]:justify-between max-md:[&_td[data-label]]:gap-4 " +
  "max-md:[&_td[data-label]]:before:shrink-0 max-md:[&_td[data-label]]:before:text-xs max-md:[&_td[data-label]]:before:text-muted-foreground max-md:[&_td[data-label]]:before:content-[attr(data-label)] " +
  "max-md:[&_td:empty]:hidden"

function Table({ className, stack, ...props }: React.ComponentProps<"table"> & { stack?: boolean }) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", stack && STACKED, className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, label, ...props }: React.ComponentProps<"td"> & { label?: string }) {
  return (
    <td
      data-slot="table-cell"
      data-label={label}
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
