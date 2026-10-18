import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { NotificationBell } from "@/components/alerts/notification-bell";
import { MobileNav, SidebarNav } from "@/components/app-nav";
import { CommandLauncher } from "@/components/command-palette/launcher";
import { AppearanceSync } from "@/components/appearance-sync";
import { SampleDataBanner } from "@/components/sample-data-banner";
import { OnboardingLayer } from "@/components/onboarding/layer";
import { Button } from "@/components/ui/button";
import { normalizeAppearance } from "@/lib/appearance";
import { LanguageSwitch } from "@/components/language-switch";
import { I18nProvider } from "@/lib/i18n/client";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { getOnboarding } from "@/lib/onboarding/read";
import { getClaims, getSettings } from "@/lib/data/settings";

// The shell is static; session-dependent parts stream in behind Suspense.
// Signed-out visitors are redirected by src/proxy.ts and data is protected by RLS.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1">
      <Suspense fallback={<SkipLink text="Skip to content" />}>
        <LocalizedSkipLink />
      </Suspense>
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
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-card px-[max(1rem,env(safe-area-inset-left))] py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
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
          <Suspense fallback={<HeaderActions locale="en" />}>
            <LocalizedHeaderActions />
          </Suspense>
        </header>
        <Suspense fallback={null}>
          <PauseBanner />
        </Suspense>
        <Suspense fallback={null}>
          <WithLocale>
            <SampleBanner />
          </WithLocale>
        </Suspense>
        <Suspense fallback={null}>
          <SavedAppearance />
        </Suspense>
        <Suspense fallback={null}>
          <WithLocale>
            <OnboardingLayer />
          </WithLocale>
        </Suspense>
        {/* Content stays a readable width on large monitors instead of spanning the whole screen. */}
        <main id="main" tabIndex={-1} className="flex-1 px-[max(1rem,env(safe-area-inset-left))] py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** The menu for the user's chosen goal. Until that is known, the default (both) shows, so nothing jumps. */
async function GoalSidebar() {
  const [read, locale] = await Promise.all([getOnboarding(), getLocale()]);
  return (
    <I18nProvider locale={locale}>
      <SidebarNav goal={read?.state.goal} />
    </I18nProvider>
  );
}

async function GoalMobileNav() {
  const [read, locale] = await Promise.all([getOnboarding(), getLocale()]);
  return (
    <I18nProvider locale={locale}>
      <MobileNav goal={read?.state.goal} />
    </I18nProvider>
  );
}

async function AccountEmail() {
  const claims = await getClaims();
  const email = claims?.email;
  return typeof email === "string" ? (
    <span className="truncate text-sm text-muted-foreground">{email}</span>
  ) : null;
}

async function PauseBanner() {
  const [{ row: settings }, locale] = await Promise.all([getSettings(), getLocale()]);
  if (!settings?.paused) return null;
  const t = translator(locale);

  return (
    <div role="alert" className="border-b bg-destructive/10 px-4 py-3 text-sm">
      <strong>{t("banner.pausedTitle")}</strong> {t("banner.pausedText")}
      {settings.pause_reason ? ` ${t("banner.pausedReason", { reason: settings.pause_reason })}` : null}
    </div>
  );
}

async function SampleBanner() {
  const { row: settings } = await getSettings();
  return settings?.sample_data ? <SampleDataBanner /> : null;
}

/** Applies the appearance saved in Settings (the source of truth) and refreshes its cookie. */
async function SavedAppearance() {
  const { row: data } = await getSettings();
  if (!data) return null;
  return <AppearanceSync value={normalizeAppearance({ theme: data.theme, density: data.density, text: data.text_size })} />;
}

/** Gives client components below it the person's language. */
async function WithLocale({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale={await getLocale()}>{children}</I18nProvider>;
}

function SkipLink({ text }: { text: string }) {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
    >
      {text}
    </a>
  );
}

async function LocalizedSkipLink() {
  return <SkipLink text={translator(await getLocale())("common.skipToContent")} />;
}

async function LocalizedHeaderActions() {
  return <HeaderActions locale={await getLocale()} />;
}

/** Search, language, notifications and sign out. Shown in English until the language is known. */
function HeaderActions({ locale }: { locale: "en" | "fr-CA" }) {
  const t = translator(locale);
  return (
    <I18nProvider locale={locale}>
      <div className="flex items-center gap-1">
        <LanguageSwitch className="hidden sm:block" />
        <CommandLauncher />
        <Suspense fallback={null}>
          <NotificationBell />
        </Suspense>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOut aria-hidden />
            {t("common.signOut")}
          </Button>
        </form>
      </div>
    </I18nProvider>
  );
}
