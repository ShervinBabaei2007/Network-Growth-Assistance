"use client";

import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DO_NOT_ADD_NOTE, MAIN_TRACK_LABEL, type Coverage } from "@/lib/job-postings/tracks";
import { setJobTrack } from "./actions";

export type TrackOption = { track: string | null; resumeId: string; label: string; score: number | null; tier: string | null };

/**
 * Which of your base resumes to use for this job: the fit of each, the one that fits best and why,
 * what the chosen one covers of the posting, and downloads of it. Nothing is added to a resume here.
 */
export function TrackCard({
  jobId,
  options,
  selected,
  recommendation,
  coverage,
}: {
  jobId: string;
  options: TrackOption[];
  selected: string | null;
  recommendation: { track: string | null; reason: string } | null;
  coverage: Coverage | null;
}) {
  const { pending, run } = useActionRunner();
  const chosen = options.find((o) => (o.track ?? "").toLowerCase() === (selected ?? "").toLowerCase()) ?? options[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Which resume to use</CardTitle>
        <CardDescription>{recommendation ? recommendation.reason : "Pick the base resume that suits this job. Fit and tailoring use it."}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-2" aria-label="Resume tracks">
          {options.map((o) => {
            const isChosen = o === chosen;
            return (
              <li key={o.resumeId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{o.label}</span>
                  <span className="text-muted-foreground"> · fit {o.score ?? "not checked"}</span>
                  {recommendation && (recommendation.track ?? "").toLowerCase() === (o.track ?? "").toLowerCase() ? <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Best fit</span> : null}
                </span>
                {isChosen ? (
                  <span className="text-xs font-medium">In use for this job</span>
                ) : (
                  <Button size="sm" variant="outline" disabled={pending} aria-label={`Use ${o.label} for this job`} onClick={() => run(() => setJobTrack(jobId, o.track), { undo: () => setJobTrack(jobId, chosen.track) })}>
                    Use this one
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {coverage ? (
          <div className="grid gap-1 text-sm">
            <p>
              <span className="font-medium">{chosen.label}</span> covers {coverage.mustMet} of {coverage.mustTotal} required {coverage.mustTotal === 1 ? "requirement" : "requirements"}.
            </p>
            {coverage.missing.length ? (
              <>
                <p className="text-muted-foreground">Not shown in this resume: {coverage.missing.slice(0, 6).map((m) => m.text).join("; ")}.</p>
                <p className="text-xs text-muted-foreground">{DO_NOT_ADD_NOTE}</p>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <a className="text-sm text-primary underline underline-offset-4" href={`/api/jobs/resume/${chosen.resumeId}/download?format=pdf`}>
            Download {chosen.track ?? MAIN_TRACK_LABEL} resume (PDF)
          </a>
          <a className="text-sm text-primary underline underline-offset-4" href={`/api/jobs/resume/${chosen.resumeId}/download?format=docx`}>
            Word
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
