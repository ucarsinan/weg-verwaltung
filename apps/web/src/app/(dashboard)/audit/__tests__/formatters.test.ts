import { describe, expect, it } from "vitest";

import {
  formatActionLabel,
  formatActorLabel,
  formatBytes,
  formatIntegrityState,
  formatJsonPreview,
  formatRiskFlag,
  formatShortId,
} from "../formatters";

describe("audit formatters", () => {
  it("formats known audit actions and keeps unknown actions readable", () => {
    expect(formatActionLabel("insert")).toBe("Angelegt");
    expect(formatActionLabel("update")).toBe("Aktualisiert");
    expect(formatActionLabel("custom_action")).toBe("custom_action");
  });

  it("formats actor labels with optional fallback", () => {
    expect(formatActorLabel("user")).toBe("Verwalter");
    expect(formatActorLabel("agent")).toBe("KI-Agent");
    expect(formatActorLabel("system", "Systemjob")).toBe("Systemjob");
  });

  it("formats risk flags and integrity states", () => {
    expect(formatRiskFlag("service_role")).toBe("Service Role");
    expect(formatRiskFlag("unknown")).toBe("unknown");
    expect(formatIntegrityState("not_checked")).toBe("Nicht geprüft");
    expect(formatIntegrityState("intact")).toBe("Intakt");
  });

  it("formats ids, json and byte sizes defensively", () => {
    expect(formatShortId("12345678-abcd")).toBe("12345678");
    expect(formatShortId(null)).toBe("-");
    expect(formatJsonPreview({ a: 1 })).toContain('"a": 1');
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("masks preview json by default but keeps admin reveal output complete", () => {
    const payload = { name: "Ada Lovelace", status: "intact" };

    expect(formatJsonPreview(payload)).toContain('"name": "[maskiert]"');
    expect(formatJsonPreview(payload, false)).toContain('"name": "Ada Lovelace"');
  });
});
