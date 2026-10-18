// The sections of a tailored resume or CV. No Zod here, so the editor stays light in the browser.

/** Resumes use the first three; a CV also has awards and activities. */
export const SECTION_KEYS = ["experience", "projects", "education", "awards", "activities"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const SECTION_HEADINGS: Record<SectionKey, string> = { experience: "Experience", projects: "Projects", education: "Education", awards: "Awards", activities: "Activities" };
