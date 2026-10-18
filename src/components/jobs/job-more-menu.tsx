"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** The extra things to do with a posting, as a shadcn dropdown menu (keyboard and screen-reader friendly). */
export function JobMoreMenu({ jobId }: { jobId: string }) {
  const items: [label: string, href: string][] = [
    ["View details", `/jobs/${jobId}`],
    ["Tailor Resume", `/jobs/${jobId}#work`],
    ["Get Resume Improvement Notes", `/jobs/${jobId}#work`],
    ["Tailor CV", `/jobs/${jobId}#work`],
    ["Generate Cover Letter", `/jobs/${jobId}#work`],
  ];
  return (
    <DropdownMenu>
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
