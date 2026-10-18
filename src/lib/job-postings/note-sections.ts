// The sections and priorities of improvement notes. Kept apart from the rules so the notes view stays light in the browser.

export const NOTE_SECTIONS = ["summary", "skills", "experience", "projects", "education", "other"] as const;
export type NoteSection = (typeof NOTE_SECTIONS)[number];
export type NotePriority = "high" | "medium" | "optional";
