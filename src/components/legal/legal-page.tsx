import type { ReactNode } from "react";
import Link from "next/link";

export const LEGAL_UPDATED = "17 October 2026";

// Who runs the service and how to reach them. Both are optional public settings. Without a
// contact address the pages point to the in-app feedback button, but a real address should
// be set before launch: British Columbia's PIPA expects a privacy contact people can reach.
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
const OPERATOR_NAME = process.env.NEXT_PUBLIC_OPERATOR_NAME;

export function Operator() {
  return <>{OPERATOR_NAME ?? "the operator of Network Growth Assistant"}</>;
}

export function ContactLine() {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
      {CONTACT_EMAIL}
    </a>
  ) : (
    <>the “Send feedback” button in the app</>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <p className="mb-6 text-sm">
        <Link href="/login" className="underline underline-offset-4">
          ← Network Growth Assistant
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <div className="mt-6 grid gap-4 text-sm leading-relaxed [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}
