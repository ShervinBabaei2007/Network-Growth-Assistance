import type { ResumeEntry, ResumeProfile } from "./types";

/** A profile as plain resume text, for comparing it with the original and with tailored versions. */
export function profileText(p: ResumeProfile): string {
  const out: string[] = [];
  if (p.name) out.push(p.name);
  const contact = [p.location, p.phone, p.email, p.contact.linkedin, p.contact.github, p.contact.website].filter(Boolean).join("  |  ");
  if (contact) out.push(contact);
  if (p.summary) out.push("SUMMARY", p.summary);
  if (p.skills.length) out.push("SKILLS", p.skills.join(", "));
  const section = (heading: string, entries: ResumeEntry[]) => {
    if (!entries.length) return;
    out.push(heading);
    for (const e of entries) {
      const dates = [e.start, e.end].filter(Boolean).join(" – ");
      out.push(`${e.organization}${dates ? `   ${dates}` : ""}`);
      const sub = [e.title, e.degree && e.major ? `${e.degree}, ${e.major}` : null, e.graduation ? `Graduation: ${e.graduation}` : null, e.location].filter(Boolean).join(", ");
      if (sub) out.push(sub);
      for (const b of e.bullets) out.push(`• ${b.text}`);
    }
  };
  section("EXPERIENCE", p.experience);
  section("PROJECTS", p.projects);
  section("EDUCATION", p.education);
  if (p.certifications.length) out.push("CERTIFICATIONS", ...p.certifications.map((c) => `• ${c}`));
  section("AWARDS", p.awards);
  section("ACTIVITIES", p.activities);
  return out.join("\n");
}
