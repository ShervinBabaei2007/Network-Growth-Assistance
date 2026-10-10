import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { MobileNav, SidebarNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

// The shell is static; session-dependent parts stream in behind Suspense.
// Signed-out visitors are redirected by src/proxy.ts and data is protected by RLS.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-56 shrink-0 border-r p-4 md:block">
        <p className="mb-4 px-3 font-semibold">Network Growth</p>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="md:hidden">
              <MobileNav />
            </div>
            <Suspense fallback={null}>
              <AccountEmail />
            </Suspense>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut aria-hidden />
              Sign out
            </Button>
          </form>
        </header>
        <Suspense fallback={null}>
          <PauseBanner />
        </Suspense>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

async function AccountEmail() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  return typeof email === "string" ? (
    <span className="truncate text-sm text-muted-foreground">{email}</span>
  ) : null;
}

async function PauseBanner() {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("paused, pause_reason")
    .maybeSingle();
  if (!settings?.paused) return null;

  return (
    <div role="alert" className="border-b bg-destructive/10 px-4 py-3 text-sm">
      <strong>Outreach is paused.</strong> Review the LinkedIn warning or restriction before
      sending more invitations.
      {settings.pause_reason ? ` Reason noted: ${settings.pause_reason}` : null}
    </div>
  );
}
