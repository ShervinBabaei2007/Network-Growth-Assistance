import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { RestartGuide } from "@/components/onboarding/restart-guide";
import { PageHeaderT, Tx } from "@/components/tx";
import { LocaleScope } from "@/components/locale-scope";
import { getT } from "@/lib/i18n/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { getOnboarding } from "@/lib/onboarding/read";
import { parseOnboarding } from "@/lib/onboarding/state";

export const metadata = { title: "Help · Network Growth" };

export default function HelpPage() {
  return (
    <div className="grid gap-6">
      <PageHeaderT title="pages.help.title" description="pages.help.description" />
      <Suspense fallback={<PageSkeleton labelKey="loading.generic" />}>
        <Guide />
      </Suspense>
      <Card>
        <CardHeader>
          <h2 className="font-medium"><Tx k="helpPage.whichTitle" /></h2>
          <CardDescription><Tx k="helpPage.whichDesc" /></CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <WhichPage />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function WhichPage() {
  const t = await getT();
  return (
    <dl className="grid gap-3 text-sm">
      <Term name={t("helpPage.discover")} to="/discover">{t("helpPage.discoverText")}</Term>
      <Term name={t("helpPage.people")} to="/people">{t("helpPage.peopleText")}</Term>
      <Term name={t("helpPage.candidates")} to="/candidates">{t("helpPage.candidatesText")}</Term>
      <Term name={t("helpPage.connections")} to="/connections">{t("helpPage.connectionsText")}</Term>
      <Term name={t("helpPage.queue")} to="/queue">{t("helpPage.queueText")}</Term>
      <Term name={t("helpPage.jobs")} to="/jobs">{t("helpPage.jobsText")}</Term>
    </dl>
  );
}

async function Guide() {
  const state = (await getOnboarding())?.state ?? parseOnboarding(undefined);
  const resumable = !state.tourDone && state.tourStep > 0;
  const t = await getT();
  return (
    <Card data-tour="help-guide">
      <CardHeader>
        <h2 className="font-medium">{t("helpPage.gettingStarted")}</h2>
        <CardDescription>{t("helpPage.gettingStartedDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Link href="/overview?tour=1" className={buttonVariants()}>
          {resumable ? t("helpPage.resumeTour") : t("helpPage.takeTour")}
        </Link>
        <LocaleScope groups={["helpPage"]}>
          <RestartGuide state={state} />
        </LocaleScope>
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
