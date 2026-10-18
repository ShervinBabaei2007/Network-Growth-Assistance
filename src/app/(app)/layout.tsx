import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { NotificationBell } from "@/components/alerts/notification-bell";
import { MobileNav, SidebarNav } from "@/components/app-nav";
import { AppearanceSync } from "@/components/appearance-sync";
import { OnboardingLayer } from "@/components/onboarding/layer";
import { Button } from "@/components/ui/button";
import { normalizeAppearance } from "@/lib/appearance";
import { getOnboarding } from "@/lib/onboarding/read";
import { getClaims, getSettings } from "@/lib/data/settings";

// Everything behind sign-in stays out of search results.
export const metadata = { robots: { index: false, follow: false } };

// The shell is static; session-dependent parts stream in behind Suspense.
// Signed-out visitors are redirected by src/proxy.ts and data is protected by RLS.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      {/* Both bars stay in view while the page scrolls: the sidebar fills the screen height and scrolls on its own if it is taller. */}
      <aside aria-label="Sidebar" className="sticky top-0 z-20 hidden h-dvh w-56 shrink-0 self-start overflow-y-auto border-r bg-sidebar p-4 md:block">
        <p className="mb-4 flex items-center gap-2 px-3 font-semibold">
          <span aria-hidden className="size-2.5 rounded-full bg-primary" />
          Network Growth
        </p>
        <Suspense fallback={<SidebarNav />}>
          <GoalSidebar />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-card px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="md:hidden">
              <Suspense fallback={<MobileNav />}>
                <GoalMobileNav />
              </Suspense>
            </div>
            <Suspense fallback={null}>
              <AccountEmail />
            </Suspense>
          </div>
          <div className="flex items-center gap-1">
            <Suspense fallback={null}>
              <NotificationBell />
            </Suspense>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut aria-hidden />
                Sign out
              </Button>
            </form>
          </div>
        </header>
        <Suspense fallback={null}>
          <PauseBanner />
        </Suspense>
        <Suspense fallback={null}>
          <SavedAppearance />
        </Suspense>
        <Suspense fallback={null}>
          <OnboardingLayer />
        </Suspense>
        {/* Content stays a readable width on large monitors instead of spanning the whole screen. */}
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-5 outline-none md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** The menu for the user's chosen goal. Until that is known, the default (both) shows, so nothing jumps. */
async function GoalSidebar() {
  const read = await getOnboarding();
  return <SidebarNav goal={read?.state.goal} />;
}

async function GoalMobileNav() {
  const read = await getOnboarding();
  return <MobileNav goal={read?.state.goal} />;
}

async function AccountEmail() {
  const claims = await getClaims();
  const email = claims?.email;
  return typeof email === "string" ? (
    <span className="truncate text-sm text-muted-foreground">{email}</span>
  ) : null;
}

async function PauseBanner() {
  const { row: settings } = await getSettings();
  if (!settings?.paused) return null;

  return (
    <div role="alert" className="border-b bg-destructive/10 px-4 py-3 text-sm">
      <strong>Outreach is paused.</strong> Review the LinkedIn warning or restriction before
      sending more invitations.
      {settings.pause_reason ? ` Reason noted: ${settings.pause_reason}` : null}
    </div>
  );
}

/** Applies the appearance saved in Settings (the source of truth) and refreshes its cookie. */
async function SavedAppearance() {
  const { row: data } = await getSettings();
  if (!data) return null;
  return <AppearanceSync value={normalizeAppearance({ theme: data.theme, density: data.density, text: data.text_size })} />;
}
