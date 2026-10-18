import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countryOptions } from "@/lib/geo/countries";
import { aiAccess } from "@/lib/job-postings/ai";
import { PROVINCE_CODES, PROVINCE_NAMES } from "@/lib/job-postings/types";
import { createClient } from "@/lib/supabase/server";
import { addManualPosting } from "../actions";
import { LocationFields } from "./location-fields";
import { PastePage } from "./paste-page";

export const metadata = { title: "Paste a posting · Jobs · Network Growth" };
export const maxDuration = 60;

export default function AddPostingPage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title="Paste a posting"
        description="Found a job yourself, on LinkedIn, Indeed, Glassdoor or a company site? Paste the whole page to fill the form, check it, and add the link. It's checked against your resume, and the site it came from is shown with it. The job's details come only from what you paste; the link is opened once, just to check the posting is still up."
      />
      <Card>
        <CardHeader>
          <CardTitle>The posting</CardTitle>
          <CardDescription>Include the requirements or qualifications section; that&apos;s what the fit check reads.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* One boundary with a plain placeholder, so nothing you type is replaced when the form arrives. */}
          <Suspense fallback={<Skeleton role="status" aria-label="Loading the form" className="h-96 rounded-lg" />}>
            <PostingForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

/** Quick fill (with "Read with AI" when this user can use AI now) and the form, starting from the country the user searches. */
async function PostingForm() {
  const supabase = await createClient();
  const [access, { data: settings }] = await Promise.all([aiAccess(supabase), supabase.from("settings").select("job_country").maybeSingle()]);
  const myCountry = settings?.job_country && settings.job_country !== "*" ? settings.job_country : "CA";
  return (
    <div className="grid gap-4">
      <PastePage aiAvailable={access.ok} />
      <ActionForm action={addManualPosting} submitLabel="Add and check fit">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="title">Job title</Label>
            <Input id="title" name="title" required maxLength={300} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="company">Company</Label>
            <Input id="company" name="company" maxLength={300} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" maxLength={120} placeholder="Leave blank if remote" />
          </div>
          <LocationFields
            countries={countryOptions().map((c) => ({ code: c.code, name: c.name }))}
            provinces={PROVINCE_CODES.map((p) => ({ code: p, name: PROVINCE_NAMES[p] }))}
            defaultCountry={myCountry}
          />
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="url">Link to the posting</Label>
            <Input id="url" name="url" type="url" required placeholder="https://www.linkedin.com/jobs/view/…" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="description">Posting text</Label>
          <Textarea id="description" name="description" required rows={14} maxLength={60000} />
        </div>
      </ActionForm>
    </div>
  );
}
