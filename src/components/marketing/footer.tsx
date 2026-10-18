import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t px-[max(1rem,env(safe-area-inset-left))] py-6 text-sm text-muted-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <p>Network Growth Assistant. Never asks for your LinkedIn password.</p>
        <nav aria-label="Footer" className="flex gap-4">
          <Link href="/guides" className="underline underline-offset-4">Guides</Link>
          <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
          <Link href="/terms" className="underline underline-offset-4">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
