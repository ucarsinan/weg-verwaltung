import { parseMarkdownSections } from "../render-pdf";

describe("parseMarkdownSections", () => {
  it("parses headings and paragraphs", () => {
    const md = "# Haupttitel\n\n## Abschnitt\n\nEin Absatz.";
    const sections = parseMarkdownSections(md);
    expect(sections).toEqual([
      { type: "heading1", text: "Haupttitel" },
      { type: "heading2", text: "Abschnitt" },
      { type: "paragraph", text: "Ein Absatz." },
    ]);
  });

  it("parses list items", () => {
    const md = "- Ja: 5\n- Nein: 2";
    const sections = parseMarkdownSections(md);
    expect(sections).toEqual([
      { type: "listitem", text: "Ja: 5" },
      { type: "listitem", text: "Nein: 2" },
    ]);
  });

  it("strips bold markers from paragraph text", () => {
    const md = "**Abstimmung:** 5 Ja, 2 Nein.";
    const sections = parseMarkdownSections(md);
    expect(sections[0].text).toBe("Abstimmung: 5 Ja, 2 Nein.");
  });

  it("skips empty lines", () => {
    const sections = parseMarkdownSections("Zeile 1\n\n\nZeile 2");
    expect(sections).toHaveLength(2);
  });
});
