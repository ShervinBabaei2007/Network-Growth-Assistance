import "server-only";
import mammoth from "mammoth";
import { boardHtmlToText } from "./ats/types";
import { MAX_PDF_BYTES, pdfToText } from "./pdf-text";
import { MAX_RESUME_TEXT } from "./resume";

/**
 * Reads a resume from a PDF, a Word document (DOCX) or pasted text. The text is what's
 * parsed and kept as the original; the uploaded file is stored separately (see the
 * upload route) so it can be downloaded again.
 */

export type ResumeSourceKind = "pdf" | "docx" | "paste";
export type TextResult = { ok: true; text: string; kind: ResumeSourceKind } | { ok: false; error: string };

export const MAX_RESUME_FILE_BYTES = MAX_PDF_BYTES;
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const UNREADABLE = "We couldn't read this resume. Try another PDF or DOCX file.";
const MIN_CHARS = 100;

/** PDF or DOCX, from its first bytes (file names and browser types can be wrong). */
export function sniffKind(bytes: Uint8Array): "pdf" | "docx" | null {
  const head = new TextDecoder().decode(bytes.subarray(0, 5));
  if (head === "%PDF-") return "pdf";
  // DOCX is a zip ("PK\x03\x04") containing word/document.xml.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.byteLength, 64_000))).includes("word/") ? "docx" : null;
  }
  return null;
}

function finish(text: string, kind: ResumeSourceKind): TextResult {
  const clean = text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.replace(/\s/g, "").length < MIN_CHARS) {
    return { ok: false, error: kind === "paste" ? "Paste your whole resume (it looks too short)." : "This file has no readable text (it may be a scan). Export it from Word or Google Docs and try again." };
  }
  return { ok: true, text: clean.slice(0, MAX_RESUME_TEXT), kind };
}

export async function docxToText(bytes: Uint8Array): Promise<TextResult> {
  try {
    const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
    // Word resumes often hide links behind text ("LinkedIn"); keep the address beside the words.
    const withLinks = html.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return /^mailto:/i.test(href) || text.includes(href.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")) ? label : `${label} (${href})`;
    });
    return finish(boardHtmlToText(withLinks), "docx");
  } catch {
    return { ok: false, error: UNREADABLE };
  }
}

/** A resume file: checks size and type by its contents, then reads its text. */
export async function fileToText(bytes: Uint8Array): Promise<TextResult> {
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > MAX_RESUME_FILE_BYTES) return { ok: false, error: "Keep the file under 4 MB." };
  const kind = sniffKind(bytes);
  if (kind === "pdf") {
    const r = await pdfToText(bytes);
    return r.ok ? finish(r.text, "pdf") : r;
  }
  if (kind === "docx") return docxToText(bytes);
  return { ok: false, error: UNREADABLE };
}

export function pastedToText(text: string): TextResult {
  if (text.length > MAX_RESUME_TEXT * 2) return { ok: false, error: "That's too long for a resume." };
  return finish(text, "paste");
}
