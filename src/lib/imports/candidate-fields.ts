// The columns a candidate CSV can map to. No Zod here, so the import screen stays light in the browser.

export const CANDIDATE_FIELDS = {
  fullName: "Name",
  profileUrl: "LinkedIn URL",
  school: "School",
  program: "Program / major",
  role: "Current role / headline",
  degreeLevel: "Degree level",
  gradYear: "Graduation year",
  notes: "Notes",
} as const;

export type CandidateField = keyof typeof CANDIDATE_FIELDS;
