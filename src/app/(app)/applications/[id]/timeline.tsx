import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DetailData } from "./detail-data";
import { NoteForm, RemoveEntry } from "./timeline-islands";

/**
 * The timeline is read-only markup, so it renders on the server and ships no JavaScript of its own. Only the
 * add-a-note form and each removable note's button are client components.
 */
export function Timeline({ data }: { data: DetailData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <NoteForm applicationId={data.id} />
        {data.timeline.length ? (
          <ol className="grid gap-3 border-l pl-4">
            {data.timeline.map((e) => (
              <li key={e.id} className="relative grid gap-0.5 text-sm">
                <span aria-hidden className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{e.label}</span>
                  <span className="text-xs text-muted-foreground">{e.when}</span>
                </div>
                {e.detail ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{e.detail}</p> : null}
                {e.removable ? <RemoveEntry id={e.id} kind={e.kind} /> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing on the timeline yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
