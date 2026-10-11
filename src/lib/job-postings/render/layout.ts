import { SECTION_HEADINGS, type CoverLetterDoc, type DocEntry, type DocHeader, type TailoredResumeDoc } from "../documents";

/**
 * The document as plain blocks, shared by the PDF and DOCX renderers so both come out
 * the same: one column, standard headings, no tables or images (ATS-friendly).
 */

export type Block =
  | { kind: "name"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "entry"; left: string; right: string; sub: string | null }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "spacer" };

export const dateRange = (e: Pick<DocEntry, "start" | "end">) => [e.start, e.end].filter(Boolean).join(" – ");

export function contactLine(h: DocHeader): string {
  return [h.location, h.phone, h.email, ...h.links].filter(Boolean).join("  |  ");
}

export function resumeBlocks(doc: TailoredResumeDoc): Block[] {
  const out: Block[] = [];
  if (doc.header.name) out.push({ kind: "name", text: doc.header.name });
  const contact = contactLine(doc.header);
  if (contact) out.push({ kind: "contact", text: contact });
  if (doc.summary) out.push({ kind: "heading", text: "Summary" }, { kind: "paragraph", text: doc.summary });
  if (doc.skills.length) out.push({ kind: "heading", text: "Skills" }, { kind: "paragraph", text: doc.skills.join(", ") });
  for (const section of doc.sections) {
    if (!section.entries.length) continue;
    out.push({ kind: "heading", text: SECTION_HEADINGS[section.key] });
    for (const e of section.entries) {
      const sub = [e.title, e.location].filter(Boolean).join(", ") || null;
      out.push({ kind: "entry", left: e.organization, right: dateRange(e), sub });
      for (const b of e.bullets) out.push({ kind: "bullet", text: b.text });
    }
  }
  if (doc.certifications.length) {
    out.push({ kind: "heading", text: "Certifications" });
    for (const c of doc.certifications) out.push({ kind: "bullet", text: c });
  }
  return out;
}

export function letterBlocks(doc: CoverLetterDoc, today = new Date()): Block[] {
  const out: Block[] = [];
  if (doc.header.name) out.push({ kind: "name", text: doc.header.name });
  const contact = contactLine(doc.header);
  if (contact) out.push({ kind: "contact", text: contact });
  out.push({ kind: "spacer" });
  out.push({ kind: "paragraph", text: today.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) });
  if (doc.company) out.push({ kind: "paragraph", text: doc.company });
  out.push({ kind: "paragraph", text: `Re: ${doc.jobTitle}` }, { kind: "spacer" });
  out.push({ kind: "paragraph", text: doc.greeting });
  for (const p of doc.paragraphs) out.push({ kind: "paragraph", text: p });
  out.push({ kind: "spacer" }, { kind: "paragraph", text: doc.closing });
  if (doc.signature) out.push({ kind: "paragraph", text: doc.signature });
  return out;
}

/** "Sam-Lee-Resume-Northwind-Labs.pdf" */
export function fileName(name: string | null, kind: "resume" | "cover_letter", company: string | null, ext: "pdf" | "docx"): string {
  const slug = (s: string) => s.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
  return [name ? slug(name) : null, kind === "resume" ? "Resume" : "Cover-Letter", company ? slug(company) : null].filter(Boolean).join("-") + `.${ext}`;
}
