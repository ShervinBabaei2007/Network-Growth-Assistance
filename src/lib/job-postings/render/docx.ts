import "server-only";
import { AlignmentType, BorderStyle, Document, LevelFormat, Packer, Paragraph, TabStopType, TextRun } from "docx";
import type { Block } from "./layout";

const FONT = "Calibri";
// Letter size with 0.75" margins: the right tab stop sits at the text edge (twips).
const RIGHT_TAB = 12240 - 2 * 1080;

function paragraph(b: Block): Paragraph {
  switch (b.kind) {
    case "name":
      return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: b.text, bold: true, size: 32, font: FONT })] });
    case "contact":
      return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: b.text, size: 19, font: FONT })] });
    case "heading":
      return new Paragraph({
        spacing: { before: 200, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "444444", space: 2 } },
        children: [new TextRun({ text: b.text.toUpperCase(), bold: true, size: 22, font: FONT })],
      });
    case "entry":
      return new Paragraph({
        spacing: { before: 100, after: 20 },
        tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
        children: [
          new TextRun({ text: b.left, bold: true, size: 21, font: FONT }),
          ...(b.right ? [new TextRun({ text: `\t${b.right}`, size: 20, font: FONT })] : []),
          ...(b.sub ? [new TextRun({ text: b.sub, italics: true, size: 20, font: FONT, break: 1 })] : []),
        ],
      });
    case "bullet":
      return new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 30 }, children: [new TextRun({ text: b.text, size: 20, font: FONT })] });
    case "paragraph":
      return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: b.text, size: 21, font: FONT })] });
    case "spacer":
      return new Paragraph({ children: [] });
  }
}

export async function renderDocx(blocks: Block[], title: string): Promise<Buffer> {
  const doc = new Document({
    title,
    creator: "Network Growth Assistant",
    numbering: {
      config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }],
    },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children: blocks.map(paragraph) }],
  });
  return Packer.toBuffer(doc);
}
