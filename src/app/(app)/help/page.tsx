import { Suspense } from "react";
import Link from "next/link";
import { RestartGuide } from "@/components/onboarding/restart-guide";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { getOnboarding } from "@/lib/onboarding/read";
import { parseOnboarding } from "@/lib/onboarding/state";

export const metadata = { title: "Help · Network Growth" };

export default function HelpPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Help" description="Replay the introduction, or see how the parts of the app fit together." />
      <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading…</p>}>
        <Guide />
      </Suspense>
      <Card>
        <CardHeader>
          <h2 className="font-medium">Which page is for what?</h2>
          <CardDescription>Four pages deal with people. They are different on purpose.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm">
            <Term name="Discover" to="/discover">A search. Describe who you&apos;d like to meet and it looks for real, verifiable matches. Saved results end up in People.</Term>
            <Term name="People" to="/people">Your personal list of people worth meeting, with status, notes and reminders.</Term>
            <Term name="Candidates" to="/candidates">LinkedIn search results you paste in and track through review, invitation and acceptance. Accepted candidates count toward your targets.</Term>
            <Term name="Connections" to="/connections">An import of the people you already know. It is only used to keep Discover from suggesting them again.</Term>
            <Term name="Daily Queue" to="/queue">Approved candidates to invite today, in order.</Term>
            <Term name="Jobs and Applications" to="/jobs">Jobs is where you search postings. Applications tracks the ones you save or apply to.</Term>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

async function Guide() {
  const state = (await getOnboarding()) ?? parseOnboarding(undefined);
  const resumable = !state.tourDone && state.tourStep > 0;
  return (
    <Card data-tour="help-guide">
      <CardHeader>
        <h2 className="font-medium">Getting started</h2>
        <CardDescription>None of this changes your data. It only shows you around.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Link href="/overview?tour=1" className={buttonVariants()}>
          {resumable ? "Resume the tour" : "Take the tour"}
        </Link>
        <RestartGuide state={state} />
      </CardContent>
    </Card>
  );
}

function Term({ name, to, children }: { name: string; to: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="font-medium">
        <Link href={to} className="underline underline-offset-4">
          {name}
        </Link>
      </dt>
      <dd className="text-muted-foreground">{children}</dd>
    </div>
  );
}
