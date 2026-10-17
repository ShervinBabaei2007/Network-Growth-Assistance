"use client";

import { Suspense, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookUser,
  Briefcase,
  ClipboardList,
  CircleHelp,
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
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; tour?: string };

/** Grouped by what the user is trying to do. Every destination is still one click away. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Start", items: [{ href: "/overview", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Find opportunities",
    items: [
      { href: "/discover", label: "Discover", icon: Telescope, tour: "nav-discover" },
      { href: "/jobs", label: "Jobs", icon: Briefcase, tour: "nav-jobs" },
    ],
  },
  {
    label: "My network",
    items: [
      { href: "/queue", label: "Daily Queue", icon: ListChecks, tour: "nav-queue" },
      { href: "/candidates", label: "Candidates", icon: Users },
      { href: "/people", label: "People", icon: BookUser },
      { href: "/connections", label: "Connections", icon: Contact },
    ],
  },
  { label: "Job applications", items: [{ href: "/applications", label: "Applications", icon: ClipboardList }] },
  {
    label: "Insights",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/disciplines", label: "Disciplines", icon: Shapes },
      { href: "/universities", label: "Schools", icon: GraduationCap },
    ],
  },
  {
    label: "Settings & help",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/help", label: "Help", icon: CircleHelp, tour: "nav-help" },
    ],
  },
];

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
  const idPrefix = useId();
  return (
    <nav className="grid gap-3" aria-label="Main" data-tour={onNavigate ? undefined : "nav"}>
      {NAV_GROUPS.map((group, gi) => {
        const headingId = `${idPrefix}-g${gi}`;
        return (
          <div key={group.label} role="group" aria-labelledby={headingId} className="grid gap-1">
            <p id={headingId} className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {group.label}
            </p>
            {group.items.map(({ href, label, icon: Icon, tour }) => {
              const active = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  data-tour={onNavigate ? undefined : tour}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-9",
                    active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </div>
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
      <SheetTrigger render={<Button variant="ghost" size="icon" className="size-11" aria-label="Open menu" data-tour="menu-button" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="overflow-y-auto p-4">
        <SheetTitle className="mb-2 px-3">Network Growth</SheetTitle>
        <NavLinks onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
