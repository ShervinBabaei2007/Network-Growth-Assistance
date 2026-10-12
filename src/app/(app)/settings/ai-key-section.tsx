import { saveOwnAiKey } from "@/app/(app)/jobs/actions";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canStoreKeys, dailyQuota } from "@/lib/job-postings/ai";
import { jobServices } from "@/lib/job-postings/services";
import { createClient } from "@/lib/supabase/server";
import { RemoveAiKeyButton } from "./remove-ai-key";

/** Optional AI for Jobs: the user's own Gemini (or Anthropic) key, or the server's daily allowance. */
export async function AiKeySection() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: mine }, { data: usage }] = await Promise.all([
    supabase.from("user_ai").select("own_key_hint").maybeSingle(),
    supabase.from("ai_usage").select("used").eq("day", today).maybeSingle(),
  ]);
  const operator = jobServices().operatorLlm.enabled && dailyQuota() > 0;
  return (
    <Card id="ai-key" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>AI for Jobs (optional)</CardTitle>
        <CardDescription>
          AI rewrites tailored resumes, CVs and cover letters for a job, and adds detail to Improvement Notes. It never adds anything your resume
          doesn&apos;t say. Without AI, you get Improvement Notes to apply yourself, and searching and fit checks work the same.{" "}
          {operator ? `This app includes ${dailyQuota()} free AI uses a day (${Math.max(0, dailyQuota() - (usage?.used ?? 0))} left today). ` : ""}
          With your own Gemini API key (free from{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline underline-offset-4">
            Google AI Studio
          </a>
          ) you&apos;re limited only by Google&apos;s free tier. An Anthropic key also works; Anthropic bills you directly. AI sends your resume and the job
          posting to that service; on Gemini&apos;s free tier Google may use what you send to improve its products.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {mine?.own_key_hint ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">Using your key ending {mine.own_key_hint}.</p>
            <RemoveAiKeyButton />
          </div>
        ) : canStoreKeys() ? (
          <ActionForm action={saveOwnAiKey} submitLabel="Save key" resetOnSuccess>
            <div className="grid gap-1.5">
              <Label htmlFor="aiKey">Your Gemini API key</Label>
              <Input id="aiKey" name="key" type="password" autoComplete="off" placeholder="AIza…" required />
              <p className="text-xs text-muted-foreground">Stored encrypted and only ever used on the server, for your own requests. You can remove it any time. An Anthropic key (sk-ant-…) is accepted too.</p>
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">This server isn&apos;t set up to store personal keys.</p>
        )}
      </CardContent>
    </Card>
  );
}
