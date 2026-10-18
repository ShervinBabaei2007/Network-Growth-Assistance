import type { ResumeProfile } from "./types";

// Reading and setting one field of a resume profile by its path. Small and dependency-free, so the editor stays light in the browser.

/** Path → current value, for the scalar and education fields thresholds apply to. */
export function getAt(profile: ResumeProfile, path: string): string | null {
  if (path.startsWith("contact.")) return profile.contact[path.slice(8) as "linkedin" | "github" | "website"];
  if (path.startsWith("education.")) {
    const [, id, field] = path.split(".");
    const e = profile.education.find((x) => x.id === id);
    return field && e ? (e[field as "degree" | "major" | "graduation"] ?? null) : null;
  }
  const v = profile[path as "name" | "email" | "phone" | "location" | "summary"];
  return typeof v === "string" ? v : null;
}

export function setAt(profile: ResumeProfile, path: string, value: string | null): ResumeProfile {
  if (path.startsWith("contact.")) return { ...profile, contact: { ...profile.contact, [path.slice(8)]: value } };
  if (path.startsWith("education.")) {
    const [, id, field] = path.split(".");
    if (!field) return profile;
    return { ...profile, education: profile.education.map((e) => (e.id === id ? { ...e, [field]: value } : e)) };
  }
  if (["name", "email", "phone", "location", "summary"].includes(path)) return { ...profile, [path]: value };
  return profile;
}
