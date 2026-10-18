"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** The shadcn dropdown menu itself. Loaded on demand by JobMoreMenu, so a page of postings doesn't ship menu code. */
export default function JobMoreMenuImpl({ jobId, defaultOpen }: { jobId: string; defaultOpen?: boolean }) {
  const items: [label: string, href: string][] = [
    ["View details", `/jobs/${jobId}`],
    ["Tailor Resume", `/jobs/${jobId}#work`],
    ["Get Resume Improvement Notes", `/jobs/${jobId}#work`],
    ["Tailor CV", `/jobs/${jobId}#work`],
    ["Generate Cover Letter", `/jobs/${jobId}#work`],
  ];
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger render={<Button size="sm" variant="ghost" />}>
        More <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {items.map(([label, href]) => (
          <DropdownMenuItem key={label} render={<Link href={href} />}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
