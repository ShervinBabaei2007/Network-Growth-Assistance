import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { NativeSelect } from "@/components/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROVINCE_CODES, PROVINCE_NAMES } from "@/lib/job-postings/types";
import { addManualPosting } from "../actions";

export const metadata = { title: "Paste a posting · Jobs · Network Growth" };
export const maxDuration = 60;

export default function AddPostingPage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title="Paste a posting"
        description="Found a job yourself, on LinkedIn, Indeed or a company site? Copy its text and link here. It's checked against your resume, and the site it came from is shown with it. Only what you paste is read; the link isn't opened by the app."
      />
      <Card>
        <CardHeader>
          <CardTitle>The posting</CardTitle>
          <CardDescription>Include the requirements or qualifications section; that&apos;s what the fit check reads.</CardDescription>
        </CardHeader>
        <CardContent>
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
              <div className="grid gap-1.5">
                <Label htmlFor="province">Province</Label>
                <NativeSelect id="province" name="province" defaultValue="BC">
                  <option value="">Remote / anywhere in Canada</option>
                  {PROVINCE_CODES.map((p) => (
                    <option key={p} value={p}>
                      {PROVINCE_NAMES[p]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
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
        </CardContent>
      </Card>
    </div>
  );
}
