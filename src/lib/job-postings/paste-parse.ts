import { readPlace } from "@/lib/geo/countries";

/**
 * Reads a whole job page the user copied (Ctrl+A, Ctrl+C on LinkedIn, Indeed, Glassdoor, an
 * employer's site…) and suggests the "Paste a posting" fields. Only the pasted text is read;
 * nothing is fetched. Every suggestion is copied from the text as it is, and anything
 * unclear is left empty for the user to fill in, never guessed.
 */

export type PastedPosting = {
  title: string | null;
  company: string | null;
  city: string | null;
  /** Canadian province or US state code, when the location states one. */
  region: string | null;
  country: string | null;
  remote: boolean;
  /** The posting's own text: the part after "About the job" / "Job description" when the page has one. */
  description: string | null;
};

/** Words that make a line look like a job title. */
const ROLE_RE =
  /\b(developer|engineer|programmer|designer|manager|director|lead|head|analyst|specialist|associate|assistant|coordinator|administrator|representative|consultant|advisor|officer|technician|technologist|scientist|researcher|architect|intern|co-?op|apprentice|nurse|teacher|tutor|instructor|educator|accountant|bookkeeper|clerk|cashier|barista|server|cook|chef|driver|operator|agent|recruiter|writer|editor|marketer|strategist|planner|supervisor|worker|handler|attendant|receptionist|therapist|pharmacist|physician|mechanic|electrician|plumber|carpenter|welder|cleaner|sales|support|executive|producer|photographer|artist)s?\b/i;

/** Page chrome that is never a title or company. */
const CHROME_RE =
  /^(home|jobs|my network|messaging|notifications|me|for business|sign in|join now|apply|easy apply|apply now|save|saved|share|report|show more|show less|see more|try premium.*|skip to .*|menu|search|filters?|all filters|job alert|set alert|follow|following|message|more|back|next|previous|close|.*\bapplicants?\b.*|.*\bago\b.*|promoted|actively recruiting|be an early applicant|reposted.*|easy apply.*|\d+ (connections?|followers|employees).*)$/i;

const START_RE = /^(about the job|about this job|full job description|job description|description|job details|about the role|the role|role overview|position summary|overview)$/i;
const END_RE = /^(show more|show less|see less|report (this )?job|similar jobs|people also viewed|more jobs|jobs you may be interested in|set alert|about the company|meet the hiring team|hiring trends|job activity|seniority level|benefits found in job post|looking for talent\?)/i;

/** "Toronto, ON · 3 days ago · 120 applicants" → "Toronto, ON". */
const firstPart = (line: string) => line.split(/\s+[·•|]\s+/)[0].trim();

function looksLikeTitle(line: string): boolean {
  return line.length >= 3 && line.length <= 100 && ROLE_RE.test(line) && !CHROME_RE.test(line) && !/[.:!?]$/.test(line) && line.split(/\s+/).length <= 12;
}

function looksLikeName(line: string): boolean {
  return line.length >= 2 && line.length <= 60 && !CHROME_RE.test(line) && !/[.:!?]$/.test(line) && !/\d{3,}/.test(line) && line.split(/\s+/).length <= 6;
}

export function parsePastedPage(text: string): PastedPosting {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const head = lines.slice(0, 40);

  // Where: the first short line near the top that names a readable place.
  let locIndex = -1;
  let place: ReturnType<typeof readPlace> | null = null;
  head.forEach((line, i) => {
    if (place || line.length > 120) return;
    const candidate = firstPart(line);
    if (candidate.length > 80 || (looksLikeTitle(candidate) && !/\bremote\b/i.test(candidate))) return;
    const read = readPlace({ text: candidate });
    if (read.country || read.scope.length) {
      place = read;
      locIndex = i;
    }
  });
  const loc = place as ReturnType<typeof readPlace> | null;
  const locLine = locIndex >= 0 ? firstPart(head[locIndex]) : "";

  // Title: the role-like line nearest above the place (job pages put it there), else the first one.
  const titleIndexes = head.map((l, i) => (looksLikeTitle(l) ? i : -1)).filter((i) => i >= 0 && i !== locIndex);
  const titleIndex = locIndex >= 0 ? ([...titleIndexes].reverse().find((i) => i < locIndex) ?? titleIndexes[0] ?? -1) : (titleIndexes[0] ?? -1);
  const title = titleIndex >= 0 ? head[titleIndex] : null;

  // Company: a short name-like line next to the title (Indeed puts it after, LinkedIn before).
  let company: string | null = null;
  if (titleIndex >= 0) {
    for (const i of [titleIndex + 1, titleIndex - 1]) {
      const line = head[i];
      if (line && i !== locIndex && looksLikeName(line) && !looksLikeTitle(line) && !readPlace({ text: firstPart(line) }).scope.length) {
        company = firstPart(line);
        break;
      }
    }
  }

  // The posting's own text: after a "Job description" heading, up to the page's next section.
  const start = lines.findIndex((l) => START_RE.test(l));
  let body: string[] = [];
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => END_RE.test(l));
    body = end >= 0 ? rest.slice(0, end) : rest;
  }
  const description = body.length ? body.join("\n").slice(0, 60_000) : null;

  return {
    title,
    company,
    city: loc?.country ? loc.city : null,
    region: loc?.region ?? null,
    country: loc?.country ?? null,
    remote: /\bremote\b/i.test(locLine),
    description,
  };
}

const squash = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Keeps only the AI's answers that appear word for word in the paste (ignoring spacing and
 * case), and reads the location like the rule-based reader. Anything else is dropped.
 */
export function groundPastedFields(ai: { title: string | null; company: string | null; location: string | null }, text: string): Omit<PastedPosting, "description"> {
  const page = squash(text);
  const keep = (v: string | null) => {
    const t = v?.replace(/\s+/g, " ").trim();
    return t && t.length <= 300 && page.includes(t.toLowerCase()) ? t : null;
  };
  const location = keep(ai.location);
  const place = location ? readPlace({ text: location }) : null;
  return {
    title: keep(ai.title),
    company: keep(ai.company),
    city: place?.country ? place.city : null,
    region: place?.region ?? null,
    country: place?.country ?? null,
    remote: Boolean(location && /\bremote\b/i.test(location)),
  };
}
