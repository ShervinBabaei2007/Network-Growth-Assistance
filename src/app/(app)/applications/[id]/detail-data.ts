import type { PayPeriod, Stage } from "@/lib/applications/stages";

export type InterviewKind = "phone" | "video" | "onsite" | "technical" | "other";

export type DetailData = {
  id: string;
  stage: Stage;
  version: number;
  attempt: number;
  jobId: string | null;
  timezone: string;
  details: { notes: string; appliedOn: string; payAmount: string; payCurrency: string; payPeriod: PayPeriod | "" };
  timeline: { id: string; kind: string; label: string; detail: string | null; when: string; removable: boolean }[];
  interviews: {
    id: string;
    when: string;
    relative: string;
    past: boolean;
    startsLocal: string;
    timezone: string;
    durationMinutes: number;
    kind: InterviewKind;
    location: string;
    notes: string;
    scheduledIn: string | null;
  }[];
  reminders: { id: string; text: string; when: string; relative: string; overdue: boolean; done: boolean }[];
  contacts: { personId: string; role: string; name: string; title: string }[];
  documents: { id: string; label: string; linkedOn: string; sourceGone: boolean }[];
  options: { people: { id: string; label: string }[]; tailored: { id: string; label: string }[]; resumes: { id: string; label: string }[] };
  otherAttempts: { id: string; label: string }[];
  nowLocal: string;
};
