import { skillsIn, type Skill } from "./taxonomy";
import type { ResumeEntry } from "./types";

/**
 * Sorts the user's own skills into programming languages, frameworks, libraries and
 * developer tools, using the skills taxonomy. The user's wording is kept; a skill the
 * taxonomy doesn't know goes under "Other". Nothing is added.
 */

export type SkillGroup = "languages" | "frameworks" | "libraries" | "tools" | "other";
export const SKILL_GROUP_LABELS: Record<SkillGroup, string> = {
  languages: "Programming languages",
  frameworks: "Frameworks",
  libraries: "Libraries",
  tools: "Developer tools",
  other: "Other skills",
};

const LIBRARIES = new Set(["Pandas", "NumPy", "scikit-learn", "TensorFlow", "PyTorch", "Keras", "Jest", "pytest", "JUnit", "Selenium", "Cypress", "Playwright", "Tailwind"]);
const MARKUP = new Set(["HTML", "CSS"]);
const FRAMEWORK_FAMILIES = /^(frontend|backend-|mobile$)/;
const TOOL_FAMILIES = /^(vcs|cicd|containers|iac|cloud|observability|sql-db|nosql-db|warehouse|bi|cad|os|web-server|pcb|sim|data-eng|process|it)$/;

export function groupOf(skill: Skill): SkillGroup {
  if (skill.family.startsWith("lang-") || MARKUP.has(skill.name)) return "languages";
  if (LIBRARIES.has(skill.name)) return "libraries";
  if (FRAMEWORK_FAMILIES.test(skill.family)) return "frameworks";
  if (TOOL_FAMILIES.test(skill.family) && skill.name !== "Agile" && skill.name !== "Scrum") return "tools";
  return "other";
}

export function groupSkills(skills: string[]): Record<SkillGroup, string[]> {
  const out: Record<SkillGroup, string[]> = { languages: [], frameworks: [], libraries: [], tools: [], other: [] };
  for (const s of skills) {
    const known = skillsIn(s)[0];
    out[known ? groupOf(known) : "other"].push(s);
  }
  return out;
}

/** The technologies a project's own lines name, in the taxonomy's spelling. */
export function projectTechnologies(project: ResumeEntry): string[] {
  return skillsIn([project.title ?? "", ...project.bullets.map((b) => b.text)].join("\n"))
    .filter((s) => groupOf(s) !== "other")
    .map((s) => s.name);
}
