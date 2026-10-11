import "server-only";
import { getDocumentProxy } from "unpdf";
import { MAX_RESUME_TEXT } from "./resume";

// Vercel caps request bodies at 4.5 MB.
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

type TextItem = { str: string; hasEOL?: boolean; transform: number[]; width?: number };

/**
 * One page's text with line breaks where the text moves to a new line. Breaking on
 * position (not only on end-of-line flags) keeps centred headers, like a name above
 * the contact line, from running together.
 */
async function pageText(pdf: Awaited<ReturnType<typeof getDocumentProxy>>, n: number): Promise<string> {
  const page = await pdf.getPage(n);
  const content = await page.getTextContent();
  let out = "";
  let lastY: number | null = null;
  let lastEnd: number | null = null;
  for (const raw of content.items as TextItem[]) {
    if (!("str" in raw)) continue;
    const y = raw.transform[5];
    const x = raw.transform[4];
    if (lastY !== null && Math.abs(y - lastY) > 2) out += "\n";
    else if (lastEnd !== null && x - lastEnd > 1 && !out.endsWith(" ") && !raw.str.startsWith(" ")) out += " ";
    out += raw.str;
    if (raw.hasEOL) {
      out += "\n";
      lastY = null;
      lastEnd = null;
    } else {
      lastY = y;
      lastEnd = x + (raw.width ?? 0);
    }
  }
  return out.replace(/\n{3,}/g, "\n\n");
}

export type PdfTextResult = { ok: true; text: string; pages: number } | { ok: false; error: string };

/** Reads the text layer of a resume PDF. The file itself is never stored. */
export async function pdfToText(bytes: Uint8Array): Promise<PdfTextResult> {
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > MAX_PDF_BYTES) return { ok: false, error: "Keep the PDF under 4 MB." };
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return { ok: false, error: "That isn't a PDF. Export your resume as a PDF and try again." };
  try {
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > 10) return { ok: false, error: "A resume should be at most 10 pages." };
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) pages.push(await pageText(pdf, i));
    const clean = pages.join("\n").replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
    // Scanned PDFs have no text layer; we don't OCR them.
    if (clean.replace(/\s/g, "").length < 100) return { ok: false, error: "This PDF has no readable text (it may be a scan). Export it from Word or Google Docs and try again." };
    return { ok: true, text: clean.slice(0, MAX_RESUME_TEXT), pages: pdf.numPages };
  } catch {
    return { ok: false, error: "Couldn't read that PDF. It may be password-protected or damaged." };
  }
}
