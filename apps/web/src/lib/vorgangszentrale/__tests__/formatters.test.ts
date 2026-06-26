import { describe, expect, it } from "vitest";

import {
  CONFIDENCE_LABELS,
  INBOX_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  TASK_STATUS_LABELS,
  VISIBILITY_LABELS,
  VORGANG_PRIORITY_LABELS,
  VORGANG_STATUS_LABELS,
  formatDueDate,
  formatKiProvenanceLabel,
  getDueState,
  prioritySortValue,
} from "../formatters";

describe("vorgangszentrale formatters", () => {
  it("covers domain status labels", () => {
    expect(VORGANG_STATUS_LABELS).toMatchObject({
      draft: "Entwurf",
      open: "Offen",
      waiting_external: "Wartet extern",
      waiting_internal: "Wartet intern",
      review_required: "Review nötig",
      resolved: "Gelöst",
      closed: "Geschlossen",
      cancelled: "Abgebrochen",
    });
    expect(TASK_STATUS_LABELS.done).toBe("Erledigt");
    expect(INBOX_STATUS_LABELS.classified).toBe("Klassifiziert");
    expect(REVIEW_STATUS_LABELS.vorschlag).toBe("Offen");
  });

  it("formats visibility, priority, and confidence labels", () => {
    expect(VISIBILITY_LABELS.internal).toBe("Intern");
    expect(VORGANG_PRIORITY_LABELS.urgent).toBe("Dringend");
    expect(CONFIDENCE_LABELS.blockiert).toBe("Blockiert");
  });

  it("classifies due dates", () => {
    const now = new Date("2026-06-22T12:00:00.000Z");
    expect(getDueState(null, now)).toBe("none");
    expect(getDueState("2026-06-21T10:00:00.000Z", now)).toBe("overdue");
    expect(getDueState("2026-06-22T01:00:00.000Z", now)).toBe("today");
    expect(getDueState("2026-06-23T00:00:00.000Z", now)).toBe("future");
  });

  it("adds due date hints", () => {
    const now = new Date("2026-06-22T12:00:00.000Z");
    expect(formatDueDate(null, now)).toBe("Keine Frist");
    expect(formatDueDate("2026-06-21T10:00:00.000Z", now)).toContain(
      "überfällig",
    );
    expect(formatDueDate("2026-06-22T10:00:00.000Z", now)).toContain("heute");
  });

  it("builds KI provenance labels", () => {
    expect(
      formatKiProvenanceLabel({
        suggestionType: "vorgang_triage",
        confidence: "mittel",
        sourceLabel: "Dokument A",
      }),
    ).toBe("KI-Vorschlag · vorgang_triage · Sicherheit mittel · Dokument A");
  });

  it("sorts priority by operational urgency", () => {
    expect(prioritySortValue("urgent")).toBeLessThan(prioritySortValue("high"));
    expect(prioritySortValue("normal")).toBeLessThan(prioritySortValue("low"));
  });
});
