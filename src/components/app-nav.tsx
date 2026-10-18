"use client";

import { lazy, Suspense, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookUser,
  Briefcase,
  ChevronDown,
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
import type { Goal } from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; group: string; primaryFor: Goal[] };

/**
 * Every destination stays one click away, but only what matches the user's goal is always on show.
 * The rest sits under "More", grouped by what it is for. Unset goal is treated as "both".
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard, group: "Start", primaryFor: ["network", "jobs", "both"] },
  { href: "/discover", label: "Discover", icon: Telescope, group: "Find opportunities", primaryFor: ["network", "both"] },
  { href: "/jobs", label: "Jobs", icon: Briefcase, group: "Find opportunities", primaryFor: ["jobs", "both"] },
  { href: "/queue", label: "Daily Queue", icon: ListChecks, group: "My network", primaryFor: ["network", "both"] },
  { href: "/candidates", label: "Candidates", icon: Users, group: "My network", primaryFor: ["network"] },
  { href: "/people", label: "People", icon: BookUser, group: "My network", primaryFor: ["network"] },
  { href: "/connections", label: "Connections", icon: Contact, group: "My network", primaryFor: [] },
  { href: "/applications", label: "Applications", icon: ClipboardList, group: "Job applications", primaryFor: ["jobs", "both"] },
  { href: "/analytics", label: "Analytics", icon: BarChart3, group: "Insights", primaryFor: [] },
  { href: "/disciplines", label: "Disciplines", icon: Shapes, group: "Insights", primaryFor: [] },
  { href: "/universities", label: "Schools", icon: GraduationCap, group: "Insights", primaryFor: [] },
];

/** Always visible, whatever the goal. */
const PINNED: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, group: "Settings & help", primaryFor: [] },
  { href: "/help", label: "Help", icon: CircleHelp, group: "Settings & help", primaryFor: [] },
];

/** Splits the destinations into those always shown for a goal and those under "More", grouped for display. */
export function splitNav(goal: Goal | undefined): { primary: NavItem[]; more: { label: string; items: NavItem[] }[] } {
  const g = goal ?? "both";
  const primary = NAV_ITEMS.filter((i) => i.primaryFor.includes(g));
  const more: { label: string; items: NavItem[] }[] = [];
  for (const item of NAV_ITEMS) {
    if (item.primaryFor.includes(g)) continue;
    const group = more.find((m) => m.label === item.group);
    if (group) group.items.push(item);
    else more.push({ label: item.group, items: [item] });
  }
  return { primary, more };
}

const isActive = (pathname: string | null, href: string) => pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));

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

export function NavLinks({ goal, onNavigate }: { goal?: Goal; onNavigate?: () => void }) {
  return <NavList pathname={usePathname()} goal={goal} onNavigate={onNavigate} />;
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string | null; onNavigate?: () => void }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-9",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {item.label}
    </Link>
  );
}

/** The links themselves; `pathname` is null while the current route is still unknown. */
function NavList({ pathname, goal, onNavigate }: { pathname: string | null; goal?: Goal; onNavigate?: () => void }) {
  const idPrefix = useId();
  const { primary, more } = splitNav(goal);
  const activeInMore = more.some((g) => g.items.some((i) => isActive(pathname, i.href)));
  // Open by itself when the current page lives under "More"; otherwise it follows what the user chose.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const expanded = chosen ?? activeInMore;
  const moreId = `${idPrefix}-more`;
  return (
    <nav className="grid gap-3" aria-label="Main">
      <div className="grid gap-1">
        {primary.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </div>

      <div className="grid gap-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={moreId}
          onClick={() => setChosen(!expanded)}
          className="flex min-h-11 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-9"
        >
          More
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
        <div id={moreId} hidden={!expanded} className="grid gap-3 border-l pl-2">
          {more.map((group, gi) => {
            const headingId = `${idPrefix}-g${gi}`;
            return (
              <div key={group.label} role="group" aria-labelledby={headingId} className="grid gap-1">
                <p id={headingId} className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-1 border-t pt-3">
        {PINNED.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </div>
      <FeedbackLink />
    </nav>
  );
}

export function SidebarNav({ goal }: { goal?: Goal }) {
  // The active highlight depends on the URL, which dynamic routes only know at request time.
  return (
    <Suspense fallback={<NavList pathname={null} goal={goal} />}>
      <NavLinks goal={goal} />
    </Suspense>
  );
}

const loadSheet = () => import("@/components/mobile-nav-sheet");
const MobileNavSheet = lazy(loadSheet);

/**
 * The phone menu. Until it is used this is only the button; the panel (and the dialog code behind it) is fetched
 * when a finger or key reaches the button, and opens as soon as it has arrived.
 */
export function MobileNav({ goal }: { goal?: Goal }) {
  const [wanted, setWanted] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Open menu"
        title="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={() => void loadSheet()}
        onFocus={() => void loadSheet()}
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
      >
        <Menu />
      </Button>
      {wanted ? (
        <Suspense fallback={null}>
          <MobileNavSheet goal={goal} open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : null}
    </>
  );
}
