import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Markdown → sections
// ---------------------------------------------------------------------------

export type MarkdownSection =
  | { type: "heading1"; text: string }
  | { type: "heading2"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "listitem"; text: string };

/** Strip **bold** and *italic* markers from a string. */
function stripInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
}

export function parseMarkdownSections(md: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith("## ")) {
      sections.push({ type: "heading2", text: stripInline(line.slice(3).trim()) });
    } else if (line.startsWith("# ")) {
      sections.push({ type: "heading1", text: stripInline(line.slice(2).trim()) });
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      sections.push({ type: "listitem", text: stripInline(line.slice(2).trim()) });
    } else if (line.startsWith("> ")) {
      sections.push({ type: "paragraph", text: `"${stripInline(line.slice(2).trim())}"` });
    } else {
      sections.push({ type: "paragraph", text: stripInline(line.trim()) });
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// React PDF components
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#222",
  },
  heading1: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    marginTop: 16,
  },
  heading2: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    marginTop: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#aaa",
    paddingBottom: 2,
  },
  paragraph: {
    marginBottom: 4,
    lineHeight: 1.5,
  },
  quote: {
    marginBottom: 4,
    lineHeight: 1.5,
    marginLeft: 12,
    fontFamily: "Helvetica-Oblique",
    color: "#444",
  },
  listitem: {
    marginLeft: 14,
    marginBottom: 2,
  },
  signatureSection: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#999",
  },
  signatureTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 16,
  },
  signatureRow: {
    marginBottom: 28,
  },
  signatureLabel: {
    fontSize: 9,
    color: "#555",
    marginBottom: 12,
  },
  signatureLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
    width: 220,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 56,
    right: 56,
    fontSize: 8,
    color: "#888",
    textAlign: "center",
  },
});

interface SignatureInfo {
  wegName: string;
  datum: string;
}

interface ProtokollPDFProps {
  sections: MarkdownSection[];
  signature: SignatureInfo;
}

function ProtokollPDF({ sections, signature }: ProtokollPDFProps) {
  return (
    <Document>
      <Page style={styles.page}>
        {sections.map((s, i) => {
          if (s.type === "heading1") {
            return <Text key={i} style={styles.heading1}>{s.text}</Text>;
          }
          if (s.type === "heading2") {
            return <Text key={i} style={styles.heading2}>{s.text}</Text>;
          }
          if (s.type === "listitem") {
            return <Text key={i} style={styles.listitem}>• {s.text}</Text>;
          }
          const isQuote = s.text.startsWith('"') && s.text.endsWith('"');
          return <Text key={i} style={isQuote ? styles.quote : styles.paragraph}>{s.text}</Text>;
        })}

        {/* Signature block — § 24 Abs. 6 S. 2 WEG */}
        <View style={styles.signatureSection}>
          <Text style={styles.signatureTitle}>Unterschriften (§ 24 Abs. 6 WEG)</Text>

          <View style={styles.signatureRow}>
            <Text style={styles.signatureLabel}>Versammlungsleiter / Verwalter</Text>
            <View style={styles.signatureLine} />
          </View>

          <View style={styles.signatureRow}>
            <Text style={styles.signatureLabel}>Wohnungseigentümer</Text>
            <View style={styles.signatureLine} />
          </View>

          <View style={styles.signatureRow}>
            <Text style={styles.signatureLabel}>Beiratsvorsitzender (falls vorhanden)</Text>
            <View style={styles.signatureLine} />
          </View>

          <Text style={styles.paragraph}>Datum: ____________________________</Text>
        </View>

        <Text style={styles.footer}>
          {signature.wegName} · Versammlung vom {signature.datum}
        </Text>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderProtokollOptions {
  markdown: string;
  wegName: string;
  datum: string;
}

export async function renderProtokollPDF(
  opts: RenderProtokollOptions,
): Promise<Buffer> {
  const sections = parseMarkdownSections(opts.markdown);
  const element = React.createElement(ProtokollPDF, {
    sections,
    signature: { wegName: opts.wegName, datum: opts.datum },
  });
  const buf = await renderToBuffer(element);
  return Buffer.from(buf);
}
