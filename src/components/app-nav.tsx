"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookUser,
  Briefcase,
  ClipboardList,
  Contact,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageSquare,
  Settings,
  Shapes,
  Telescope,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/queue", label: "Daily Queue", icon: ListChecks },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/discover", label: "Discover", icon: Telescope },
  { href: "/people", label: "People", icon: BookUser },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: ClipboardList },
  { href: "/connections", label: "Connections", icon: Contact },
  { href: "/disciplines", label: "Disciplines", icon: Shapes },
  { href: "/universities", label: "Schools", icon: GraduationCap },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

// Where feedback goes: a mailto: or a form link. The button is hidden when it isn't set.
const FEEDBACK_URL = process.env.NEXT_PUBLIC_FEEDBACK_URL;

function FeedbackLink() {
  if (!FEEDBACK_URL) return null;
  const external = /^https?:/i.test(FEEDBACK_URL);
  return (
    <a
      href={FEEDBACK_URL}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="mt-2 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      <MessageSquare className="size-4" aria-hidden />
      Send feedback
      {external && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <NavList pathname={usePathname()} onNavigate={onNavigate} />;
}

/** The links themselves; `pathname` is null while the current route is still unknown. */
function NavList({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <nav className="grid gap-1" aria-label="Main">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
      <FeedbackLink />
    </nav>
  );
}

export function SidebarNav() {
  // The active highlight depends on the URL, which dynamic routes only know at request time.
  return (
    <Suspense fallback={<NavList pathname={null} />}>
      <NavLinks />
    </Suspense>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="p-4">
        <SheetTitle className="mb-2 px-3">Network Growth</SheetTitle>
        <NavLinks onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
