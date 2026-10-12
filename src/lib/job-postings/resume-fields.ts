import { clean } from "@/lib/text/match";
import { classifyLinks, EMAIL, linksIn, nameCandidate, parseResumeHeuristic, PHONE, resumeSections } from "./resume";
import { skillsIn } from "./taxonomy";
import { ResumeProfile, type FieldMeta, type FieldMetaMap, type ResumeEntry } from "./types";

/**
 * How sure the parser is about each field it filled, and what it couldn't find.
 *
 * - confidence ≥ 0.8: filled and shown normally
 * - 0.5 – 0.8: filled, but marked "Needs review" with the reason
 * - < 0.5: left empty; what was found is offered as a suggestion
 * - nothing found: left empty and marked "Not found in your resume"
 *
 * Confidence comes from rules about the text (one email or several, a date that could be a
 * start or an end…), never from a model's say-so, so the same resume always gets the same marks.
 */

export const CONFIDENT = 0.8;
export const USABLE = 0.5;

const meta = (confidence: number, extra: Omit<Partial<FieldMeta>, "confidence" | "needsReview"> = {}): FieldMeta => ({
  confidence,
  needsReview: confidence < CONFIDENT && !extra.missing,
  ...extra,
});
const missing = (reason = "Not found in your resume."): FieldMeta => ({ confidence: 0, needsReview: false, missing: true, reason });

const distinct = (values: string[]) => [...new Map(values.map((v) => [clean(v).trim() || v, v.trim()])).values()];
const allMatches = (text: string, re: RegExp) => [...text.matchAll(new RegExp(re.source, "gi"))].map((m) => m[0]);
const YEAR = /\b(19[5-9]\d|20[0-4]\d)\b/g;
const NAME_SHAPE = /^[\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+){1,3}$/u;

/** The fields every profile has, with the label used in messages. Entry fields are added per entry. */
export const SCALAR_FIELDS = {
  name: "Full name",
  email: "Email",
  phone: "Phone number",
  location: "Location",
  "contact.linkedin": "LinkedIn URL",
  "contact.github": "GitHub URL",
  "contact.website": "Portfolio website",
  summary: "Professional summary",
  skills: "Skills",
  certifications: "Certifications",
  awards: "Awards",
  activities: "Extracurricular activities",
} as const;
export type ScalarPath = keyof typeof SCALAR_FIELDS;

/** Sections a resume may simply not have; their absence isn't something to fix. */
const OPTIONAL: ScalarPath[] = ["contact.github", "contact.website", "summary", "certifications", "awards", "activities"];

export function fieldLabel(path: string, profile?: ResumeProfile): string {
  if (path in SCALAR_FIELDS) return SCALAR_FIELDS[path as ScalarPath];
  const [section, id, field] = path.split(".");
  const entry = profile ? (profile[section as "experience" | "education" | "projects"] as ResumeEntry[] | undefined)?.find((e) => e.id === id) : undefined;
  const where = entry?.organization ? ` (${entry.organization})` : "";
  if (section === "education") return `${field === "degree" ? "Degree" : field === "major" ? "Major" : field === "graduation" ? "Graduation date" : "School"}${where}`;
  if (section === "experience") return `Work experience${where}`;
  if (section === "projects") return `Project${where}`;
  return path;
}

/** Works out confidence for every field of a parsed profile against the resume text. */
export function analyzeResume(text: string, profile: ResumeProfile): FieldMetaMap {
  const out: FieldMetaMap = {};
  const { header, sections } = resumeSections(text);
  const headerText = header.join("\n");

  // Name: the first line of the header, if it reads like a name.
  const name = profile.name ?? nameCandidate(header);
  out.name = !name ? missing() : NAME_SHAPE.test(name) ? meta(0.92, { sourceText: name }) : meta(0.45, { sourceText: name, alternatives: [name], reason: `We weren't sure “${name}” is your name.` });

  // Email: one address is clear; several mean choosing.
  const emails = distinct(allMatches(text, EMAIL));
  out.email = !profile.email
    ? missing()
    : emails.length > 1
      ? meta(0.6, { sourceText: profile.email, alternatives: emails.filter((e) => e !== profile.email), reason: `We found ${emails.length} email addresses. Check this is the one employers should use.` })
      : meta(0.97, { sourceText: profile.email });

  const phones = distinct(allMatches(headerText || text, PHONE).map((p) => p.replace(/[^\d+]/g, "")));
  out.phone = !profile.phone
    ? missing()
    : phones.length > 1
      ? meta(0.6, { sourceText: profile.phone, alternatives: allMatches(headerText, PHONE).filter((p) => p.trim() !== profile.phone), reason: `We found ${phones.length} phone numbers. Check this is the right one.` })
      : meta(0.92, { sourceText: profile.phone });

  out.location = profile.location ? meta(0.88, { sourceText: profile.location }) : missing();

  // Links: in the contact lines they're the person's own; elsewhere they may be anything.
  const inHeader = classifyLinks(linksIn(headerText));
  const anywhere = classifyLinks(linksIn(text));
  const link = (value: string | null, found: string | null, kind: string): FieldMeta =>
    !value ? missing() : found === value ? meta(0.95, { sourceText: value }) : meta(0.7, { sourceText: value, reason: `Found outside your contact details. Check it's your ${kind}.` });
  out["contact.linkedin"] = link(profile.contact.linkedin, inHeader.linkedin, "LinkedIn profile");
  out["contact.github"] = profile.contact.github
    ? link(profile.contact.github, inHeader.github, "GitHub profile")
    : anywhere.githubRepo
      ? meta(0.4, { alternatives: [anywhere.githubRepo], reason: "We found a link to a GitHub project, not to your profile." })
      : missing();
  const site = profile.contact.website;
  const nameWords = clean(profile.name).trim().split(" ").filter((w) => w.length >= 3);
  out["contact.website"] = !site
    ? missing()
    : nameWords.some((w) => clean(site).includes(w))
      ? meta(0.9, { sourceText: site })
      : meta(0.65, { sourceText: site, reason: "Check this is your own website or portfolio, not an employer's or a project's." });

  out.summary = profile.summary ? meta(0.9, { sourceText: profile.summary.slice(0, 200) }) : missing("No summary section found.");

  // Skills: a Skills section is clear. Without one, skills named in the experience are a suggestion.
  if (sections.skills?.length && profile.skills.length) out.skills = meta(0.9);
  else if (profile.skills.length) out.skills = meta(0.6, { reason: "There's no Skills section; these were found in your experience and projects. Remove any you don't want listed." });
  else out.skills = missing("No skills section found.");

  for (const key of ["certifications", "awards", "activities"] as const) {
    const has = Array.isArray(profile[key]) && profile[key].length > 0;
    out[key] = has ? meta(0.9) : missing(`No ${SCALAR_FIELDS[key].toLowerCase()} found.`);
  }

  for (const e of profile.experience) out[`experience.${e.id}`] = entryMeta(e, "employer");
  for (const e of profile.projects) {
    out[`projects.${e.id}`] = !e.organization ? meta(0.4, { reason: "Couldn't tell which project these lines belong to." }) : e.bullets.length ? meta(0.88) : meta(0.65, { reason: "No description found for this project." });
  }
  const educationYears = [...new Set((sections.education ?? []).join(" ").match(YEAR) ?? [])];
  for (const e of profile.education) Object.assign(out, educationMeta(e, educationYears, profile.education.length));
  return out;
}

const JOB_TITLE_WORDS = /\b(developer|engineer|intern|co-?op|analyst|manager|assistant|technician|designer|consultant|specialist|coordinator|scientist|administrator|programmer|tutor)\b/i;

function entryMeta(e: ResumeEntry, orgWord: string): FieldMeta {
  if (!e.organization) return meta(0.4, { reason: `Couldn't tell which ${orgWord} these lines belong to.` });
  if (JOB_TITLE_WORDS.test(e.organization) && (!e.title || !JOB_TITLE_WORDS.test(e.title))) {
    return meta(0.6, { sourceText: e.organization, reason: `“${e.organization}” looks like a job title. Check the ${orgWord} and title weren't swapped.` });
  }
  if (!e.title) return meta(0.6, { sourceText: e.organization, reason: "Couldn't find the job title." });
  if (!e.start && !e.end) return meta(0.65, { sourceText: e.organization, reason: "Couldn't find the dates." });
  return meta(0.9, { sourceText: e.organization });
}

function educationMeta(e: ResumeEntry, sectionYears: string[], entries: number): FieldMetaMap {
  const p = `education.${e.id}`;
  const out: FieldMetaMap = {};
  out[p] = e.organization ? meta(0.9, { sourceText: e.organization }) : meta(0.4, { reason: "Couldn't tell which school this is." });
  out[`${p}.degree`] = e.degree ? meta(0.88, { sourceText: e.title ?? e.degree }) : missing("Couldn't find the degree or diploma.");
  out[`${p}.major`] = e.major ? meta(0.85, { sourceText: e.title ?? e.major }) : missing("Couldn't find the program or major.");

  const ongoing = /present|current|now|ongoing/i.test(e.end ?? "");
  const own = new Set([e.start, e.end, e.graduation].flatMap((d) => (d ?? "").match(YEAR) ?? []));
  // Other years in a one-school section (a scholarship year, a co-op term) make the date ambiguous.
  const others = entries === 1 ? sectionYears.filter((y) => !own.has(y)) : [];
  if (e.graduation) {
    out[`${p}.graduation`] = others.length
      ? meta(0.58, { sourceText: e.graduation, alternatives: others, reason: "We found multiple possible dates. Please verify this field." })
      : meta(/expected|anticipated/i.test(e.graduation) ? 0.85 : 0.88, { sourceText: e.graduation });
  } else if (ongoing) {
    out[`${p}.graduation`] = missing("Your studies are listed as ongoing. Add your expected graduation date.");
  } else if (e.end && !e.start) {
    // One date with no range: could be when you finish, or when you started.
    out[`${p}.graduation`] = meta(0.58, { sourceText: e.end, alternatives: [e.end, ...others], reason: "We found one date for this school but couldn't tell if it's when you finish. Please verify this field." });
  } else {
    out[`${p}.graduation`] = missing("We couldn't identify your graduation date. Please enter it manually.");
  }
  return out;
}

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

/**
 * Applies the thresholds: below USABLE a value is removed (kept as a suggestion); a value
 * suggested by the rules (a lone education date) is filled only above USABLE and flagged.
 */
export function applyThresholds(profile: ResumeProfile, fields: FieldMetaMap): { profile: ResumeProfile; meta: FieldMetaMap } {
  let next = profile;
  const out: FieldMetaMap = { ...fields };
  for (const [path, m] of Object.entries(fields)) {
    if (m.missing) continue;
    const value = getAt(next, path);
    if (m.confidence < USABLE) {
      if (value) {
        next = setAt(next, path, null);
        out[path] = { ...m, needsReview: true, alternatives: [...new Set([value, ...(m.alternatives ?? [])])] };
      } else if (m.alternatives?.length) {
        out[path] = { ...m, needsReview: true };
      }
    } else if (!value && path.endsWith(".graduation") && m.sourceText) {
      next = setAt(next, path, m.sourceText);
    }
  }
  return { profile: next, meta: out };
}

/** Parse without AI, then mark each field with how sure we are. */
export function parseResumeDetailed(text: string): { profile: ResumeProfile; meta: FieldMetaMap } {
  let profile = parseResumeHeuristic(text);
  // Without a Skills section, offer the skills the experience and projects name (verbatim names only).
  if (!profile.skills.length) {
    const body = [...profile.experience, ...profile.projects].flatMap((e) => [e.title ?? "", ...e.bullets.map((b) => b.text)]).join("\n");
    profile = { ...profile, skills: skillsIn(body).map((s) => s.name).slice(0, 40) };
  }
  return applyThresholds(profile, analyzeResume(text, profile));
}

/**
 * Combines the rule-based reading with an AI reading of the same text (already grounded:
 * every AI value is in the text). Agreement raises confidence; disagreement is flagged
 * with both readings; the AI fills a gap only as a value to review.
 */
export function reconcileWithAi(text: string, rules: { profile: ResumeProfile; meta: FieldMetaMap }, ai: ResumeProfile): { profile: ResumeProfile; meta: FieldMetaMap } {
  let profile = rules.profile;
  const out: FieldMetaMap = { ...rules.meta };
  for (const path of ["name", "email", "phone", "location", "contact.linkedin", "contact.github", "contact.website", "summary"]) {
    const mine = getAt(profile, path);
    const theirs = getAt(ai, path);
    if (!theirs) continue;
    if (mine && clean(mine) === clean(theirs)) {
      out[path] = { ...out[path], confidence: Math.max(out[path]?.confidence ?? 0, 0.95), needsReview: false, reason: undefined };
    } else if (mine) {
      out[path] = { ...out[path], confidence: Math.min(out[path]?.confidence ?? 0.6, 0.6), needsReview: true, alternatives: [...new Set([theirs, ...(out[path]?.alternatives ?? [])])], reason: "Two readings of your resume disagree. Check which is right." };
    } else {
      profile = setAt(profile, path, theirs);
      out[path] = { confidence: 0.7, needsReview: true, sourceText: theirs, reason: "Found on a second read of your resume. Check it." };
    }
  }
  // Sections: the AI's reading replaces the rules' when it kept clearly more (it is grounded, so nothing is invented).
  const bullets = (p: ResumeProfile) => [...p.experience, ...p.projects].reduce((n, e) => n + e.bullets.length, 0);
  if (bullets(ai) > bullets(profile)) {
    profile = { ...profile, experience: ai.experience, projects: ai.projects, education: ai.education.length ? ai.education : profile.education };
    for (const k of Object.keys(out)) if (/^(experience|projects|education)\./.test(k)) delete out[k];
    const fresh = analyzeResume(text, profile);
    for (const [k, v] of Object.entries(fresh)) if (/^(experience|projects|education)\./.test(k)) out[k] = v;
  }
  for (const key of ["awards", "activities", "certifications"] as const) {
    if (!profile[key].length && ai[key].length) {
      profile = { ...profile, [key]: ai[key] };
      out[key] = { confidence: 0.75, needsReview: true, reason: "Found on a second read of your resume. Check it." };
    }
  }
  return applyThresholds(ResumeProfile.parse(profile), out);
}

// ------------------------------------------------------------------ the import summary

export type ImportSummary = {
  /** Profile fields that now have a value. */
  filled: number;
  /** Paths that need the user's attention, in the order they appear on the page. */
  needsReview: string[];
  /** Important fields that weren't found (optional sections aren't listed). */
  missing: string[];
  /** Share of the core checklist that's complete, 0–100. */
  completeness: number;
};

/** The core checklist behind "Profile completeness": what most applications need. */
export function completenessChecks(p: ResumeProfile): { label: string; done: boolean }[] {
  const latestEducation = p.education[0];
  return [
    { label: "Name", done: Boolean(p.name) },
    { label: "Email", done: Boolean(p.email) },
    { label: "Phone", done: Boolean(p.phone) },
    { label: "Location", done: Boolean(p.location) },
    { label: "LinkedIn URL", done: Boolean(p.contact.linkedin) },
    { label: "Summary", done: Boolean(p.summary) },
    { label: "Skills", done: p.skills.length > 0 },
    { label: "Work experience with title and dates", done: p.experience.some((e) => e.organization && e.title && (e.start || e.end)) },
    { label: "Education with degree", done: p.education.some((e) => e.organization && e.degree) },
    { label: "Graduation date", done: Boolean(latestEducation?.graduation) },
    { label: "A project", done: p.projects.some((e) => e.organization) },
  ];
}

export function importSummary(profile: ResumeProfile, fields: FieldMetaMap): ImportSummary {
  let filled = 0;
  for (const path of Object.keys(SCALAR_FIELDS) as ScalarPath[]) {
    const v = path === "skills" || path === "certifications" || path === "awards" || path === "activities" ? profile[path].length > 0 : Boolean(getAt(profile, path));
    if (v) filled++;
  }
  for (const e of profile.experience) filled += [e.organization, e.title, e.start || e.end].filter(Boolean).length;
  for (const e of profile.education) filled += [e.organization, e.degree, e.major, e.graduation].filter(Boolean).length;
  for (const e of profile.projects) filled += [e.organization, e.bullets.length ? "y" : ""].filter(Boolean).length;

  const order = (path: string) => {
    const keys = Object.keys(SCALAR_FIELDS);
    const i = keys.indexOf(path);
    return i >= 0 ? i : keys.length + ["experience", "education", "projects"].indexOf(path.split(".")[0]);
  };
  const needsReview = Object.entries(fields)
    .filter(([, m]) => m.needsReview)
    .map(([p]) => p)
    .sort((a, b) => order(a) - order(b));
  const missingImportant = Object.entries(fields)
    .filter(([p, m]) => m.missing && !OPTIONAL.includes(p as ScalarPath) && !/\.(major)$/.test(p))
    .map(([p]) => p)
    .sort((a, b) => order(a) - order(b));
  const checks = completenessChecks(profile);
  return { filled, needsReview, missing: missingImportant, completeness: Math.round((checks.filter((c) => c.done).length / checks.length) * 100) };
}

/**
 * After the user saves the profile, fields they changed or confirmed are no longer
 * uncertain. Fields that are now filled stop being "missing"; emptied ones become missing.
 */
export function confirmFields(before: ResumeProfile, after: ResumeProfile, fields: FieldMetaMap, confirmed: string[] = []): FieldMetaMap {
  const out: FieldMetaMap = { ...fields };
  const paths = new Set([...Object.keys(fields), ...Object.keys(SCALAR_FIELDS), ...after.education.flatMap((e) => [`education.${e.id}.degree`, `education.${e.id}.major`, `education.${e.id}.graduation`])]);
  for (const path of paths) {
    const a = getAt(before, path);
    const b = getAt(after, path);
    const isList = path === "skills" || path === "certifications" || path === "awards" || path === "activities";
    const changed = isList ? JSON.stringify(before[path as "skills"]) !== JSON.stringify(after[path as "skills"]) : a !== b;
    const hasValue = isList ? after[path as "skills"].length > 0 : Boolean(b);
    if (confirmed.includes(path) || (changed && hasValue)) out[path] = { confidence: 1, needsReview: false, reason: "Checked by you." };
    else if (changed && !hasValue) out[path] = missing();
  }
  for (const section of ["experience", "projects"] as const) {
    const ids = new Set(after[section].map((e) => e.id));
    for (const e of after[section]) {
      const old = before[section].find((x) => x.id === e.id);
      const path = `${section}.${e.id}`;
      if (confirmed.includes(path) || (old && JSON.stringify(old) !== JSON.stringify(e)) || !old) out[path] = { confidence: 1, needsReview: false, reason: "Checked by you." };
    }
    for (const k of Object.keys(out)) if (k.startsWith(`${section}.`) && !ids.has(k.split(".")[1])) delete out[k];
  }
  for (const e of after.education) {
    const path = `education.${e.id}`;
    const old = before.education.find((x) => x.id === e.id);
    if (confirmed.includes(path) || !old || old.organization !== e.organization) out[path] = { confidence: 1, needsReview: false, reason: "Checked by you." };
  }
  const eduIds = new Set(after.education.map((e) => e.id));
  for (const k of Object.keys(out)) if (k.startsWith("education.") && !eduIds.has(k.split(".")[1])) delete out[k];
  return out;
}
