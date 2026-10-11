import { saveOwnAiKey } from "@/app/(app)/jobs/actions";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canStoreKeys, dailyQuota } from "@/lib/job-postings/ai";
import { jobServices } from "@/lib/job-postings/services";
import { createClient } from "@/lib/supabase/server";
import { RemoveAiKeyButton } from "./remove-ai-key";

/** Optional AI for Jobs: the user's own Anthropic key, or the operator's daily allowance. */
export async function AiKeySection() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: mine }, { data: usage }] = await Promise.all([
    supabase.from("user_ai").select("own_key_hint").maybeSingle(),
    supabase.from("ai_usage").select("used").eq("day", today).maybeSingle(),
  ]);
  const operator = jobServices().operatorLlm.enabled && dailyQuota() > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI for Jobs (optional)</CardTitle>
        <CardDescription>
          Everything in Jobs works without AI. AI only rewords tailored resumes and cover letters, and never adds anything your resume doesn&apos;t
          say.{" "}
          {operator ? `This app includes ${dailyQuota()} AI rewrites a day (${Math.max(0, dailyQuota() - (usage?.used ?? 0))} left today). ` : ""}
          With your own Anthropic API key there&apos;s no daily limit; Anthropic bills you directly.
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
              <Label htmlFor="aiKey">Your Anthropic API key</Label>
              <Input id="aiKey" name="key" type="password" autoComplete="off" placeholder="sk-ant-…" required />
              <p className="text-xs text-muted-foreground">Stored encrypted and only ever used on the server for your own rewrites. You can remove it any time.</p>
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">This server isn&apos;t set up to store personal keys.</p>
        )}
      </CardContent>
    </Card>
  );
}
