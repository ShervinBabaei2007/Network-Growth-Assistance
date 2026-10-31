import { Contacts } from "./contacts";
import type { DetailData } from "./detail-data";
import { Details } from "./details-form";
import { Documents } from "./documents";
import { Interviews } from "./interviews";
import { Reminders } from "./reminders";
import { StageCard } from "./stage-card";
import { Timeline } from "./timeline";

export type { DetailData } from "./detail-data";

/**
 * The application page's layout. A server component: each section below is either server markup (the timeline) or
 * its own small client component, so the page hydrates only what is interactive instead of one 700-line file.
 */
export function ApplicationDetail({ data }: { data: DetailData }) {
  return (
    <div className="@container">
      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid content-start gap-6">
        <StageCard data={data} />
        <Timeline data={data} />
      </div>
      <div className="grid content-start gap-6">
        <Interviews data={data} />
        <Reminders data={data} />
        <Contacts data={data} />
        <Documents data={data} />
        <Details data={data} />
      </div>
      </div>
    </div>
  );
}
