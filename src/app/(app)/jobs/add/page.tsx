import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderT } from "@/components/tx";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countryOptions } from "@/lib/geo/countries";
import { aiAccess } from "@/lib/job-postings/ai";
import { PROVINCE_CODES, PROVINCE_NAMES } from "@/lib/job-postings/types";
import { createClient } from "@/lib/supabase/server";
import { LocaleScope } from "@/components/locale-scope";
import { getT } from "@/lib/i18n/server";
import { addManualPosting } from "../actions";
import { LocationFields } from "./location-fields";
import { PastePage } from "./paste-page";

export const metadata = { title: "Paste a posting · Jobs · Network Growth" };
export const maxDuration = 60;

export default function AddPostingPage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeaderT
        back={{ href: "/jobs", label: "pages.backJobs" }}
        title="pages.jobsAdd.title"
        description="pages.jobsAdd.description"
      />
      <Suspense fallback={null}>
        <PostingCard />
      </Suspense>
    </div>
  );
}

async function PostingCard() {
  const t = await getT();
  return (
      <Card>
        <CardHeader>
          <CardTitle>{t("msg.thePostingd0bc")}</CardTitle>
          <CardDescription>{t("msg.includeTheRequirementsOrd6b8")}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* One boundary with a plain placeholder, so nothing you type is replaced when the form arrives. */}
          <Suspense fallback={<Skeleton role="status" aria-label={t("msg.loadingTheForm051c")} className="h-96 rounded-lg" />}>
            <PostingForm />
          </Suspense>
        </CardContent>
      </Card>
  );
}

/** Quick fill (with "Read with AI" when this user can use AI now) and the form, starting from the country the user searches. */
async function PostingForm() {
  const t = await getT();
  const supabase = await createClient();
  const [access, { data: settings }] = await Promise.all([aiAccess(supabase), supabase.from("settings").select("job_country").maybeSingle()]);
  const myCountry = settings?.job_country && settings.job_country !== "*" ? settings.job_country : "CA";
  return (
    <div className="grid gap-4">
      <LocaleScope groups={["msg", "ui"]}>
        <PastePage aiAvailable={access.ok} />
      </LocaleScope>
      <ActionForm action={addManualPosting} submitLabel={t("msg.addAndCheckFit7e2b")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="title">{t("msg.jobTitlef4a7")}</Label>
            <Input id="title" name="title" required maxLength={300} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="company">{t("msg.company1c76")}</Label>
            <Input id="company" name="company" maxLength={300} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="city">{t("msg.city57d0")}</Label>
            <Input id="city" name="city" maxLength={120} placeholder={t("msg.leaveBlankIfRemote800e")} />
          </div>
          <LocationFields
            countries={countryOptions().map((c) => ({ code: c.code, name: c.name }))}
            provinces={PROVINCE_CODES.map((p) => ({ code: p, name: PROVINCE_NAMES[p] }))}
            defaultCountry={myCountry}
          />
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="url">{t("msg.linkToThePostingd61e")}</Label>
            <Input id="url" name="url" type="url" required placeholder="https://www.linkedin.com/jobs/view/…" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="description">{t("msg.postingTexte067")}</Label>
          <Textarea id="description" name="description" required rows={14} maxLength={60000} />
        </div>
      </ActionForm>
    </div>
  );
}
