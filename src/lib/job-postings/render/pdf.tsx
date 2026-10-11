import "server-only";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Block } from "./layout";

// Helvetica is built into PDF readers, so nothing is embedded and text stays selectable for ATS parsers.
const s = StyleSheet.create({
  page: { paddingVertical: 54, paddingHorizontal: 54, fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.35, color: "#111" },
  name: { fontSize: 17, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 2 },
  contact: { fontSize: 9, textAlign: "center", marginBottom: 10, color: "#333" },
  heading: { fontSize: 10.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginTop: 10, marginBottom: 4, paddingBottom: 2, borderBottomWidth: 0.75, borderBottomColor: "#444" },
  entryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  entryLeft: { fontFamily: "Helvetica-Bold", fontSize: 10.5, flexShrink: 1, paddingRight: 8 },
  entryRight: { fontSize: 9.5 },
  sub: { fontFamily: "Helvetica-Oblique", fontSize: 9.5, marginBottom: 2 },
  bulletRow: { flexDirection: "row", marginBottom: 1.5, paddingLeft: 6 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
  paragraph: { marginBottom: 7 },
  spacer: { height: 8 },
});

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case "name":
      return <Text style={s.name}>{b.text}</Text>;
    case "contact":
      return <Text style={s.contact}>{b.text}</Text>;
    case "heading":
      return <Text style={s.heading}>{b.text}</Text>;
    case "entry":
      return (
        <View wrap={false}>
          <View style={s.entryRow}>
            <Text style={s.entryLeft}>{b.left}</Text>
            {b.right ? <Text style={s.entryRight}>{b.right}</Text> : null}
          </View>
          {b.sub ? <Text style={s.sub}>{b.sub}</Text> : null}
        </View>
      );
    case "bullet":
      return (
        <View style={s.bulletRow} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{b.text}</Text>
        </View>
      );
    case "paragraph":
      return <Text style={s.paragraph}>{b.text}</Text>;
    case "spacer":
      return <View style={s.spacer} />;
  }
}

export async function renderPdf(blocks: Block[], title: string, author: string | null): Promise<Buffer> {
  return renderToBuffer(
    <Document title={title} author={author ?? undefined} creator="Network Growth Assistant" producer="Network Growth Assistant">
      <Page size="LETTER" style={s.page}>
        {blocks.map((b, i) => (
          <BlockView key={i} b={b} />
        ))}
      </Page>
    </Document>,
  );
}
