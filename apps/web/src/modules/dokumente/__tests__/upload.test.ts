import { describe, expect, it } from "vitest";

import {
  ERLAUBTE_MIME_TYPEN,
  MAX_UPLOAD_BYTES,
  baueStoragePfad,
  pruefeDatei,
} from "../upload";

function datei(name: string, type: string, size: number): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("pruefeDatei", () => {
  it("nimmt ein PDF unterhalb der Grenze an", () => {
    expect(pruefeDatei(datei("a.pdf", "application/pdf", 1_000_000))).toEqual({
      ok: true,
    });
  });

  it("lehnt eine zu grosse Datei ab und nennt die Grenze", () => {
    const r = pruefeDatei(datei("a.pdf", "application/pdf", MAX_UPLOAD_BYTES + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.meldung).toContain("10");
  });

  it("lehnt einen nicht erlaubten Dateityp ab", () => {
    const r = pruefeDatei(datei("a.exe", "application/x-msdownload", 1000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.meldung).toContain("Dateityp");
  });

  it("lehnt eine leere Datei ab", () => {
    // file_size_bytes > 0 ist eine CHECK-Bedingung in 0015 — die Meldung soll
    // aus dem Formular kommen, nicht als Datenbankfehler.
    const r = pruefeDatei(datei("leer.pdf", "application/pdf", 0));
    expect(r.ok).toBe(false);
  });

  it("die Grenze entspricht 10 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it("erlaubt genau die fuenf Typen des Buckets", () => {
    expect(ERLAUBTE_MIME_TYPEN).toHaveLength(5);
  });
});

describe("baueStoragePfad", () => {
  it("folgt dem Muster tenant/weg/doctyp/id-vN.ext", () => {
    expect(
      baueStoragePfad({
        tenantId: "11111111-1111-4111-8111-111111111111",
        wegId: "22222222-2222-4222-8222-222222222222",
        docTyp: "rechnung",
        dokumentId: "33333333-3333-4333-8333-333333333333",
        versionNo: 1,
        dateiname: "Wartung.pdf",
      }),
    ).toBe(
      "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/rechnung/33333333-3333-4333-8333-333333333333-v1.pdf",
    );
  });

  it("haengt die Versionsnummer an, damit eine zweite Version einen neuen Pfad bekommt", () => {
    // weg-docs vergibt laut 0015 keine UPDATE-Policy auf storage.objects —
    // ohne das Versions-Segment wuerde eine zweite Version denselben Pfad
    // treffen wie die erste und der Upload mit "already exists" scheitern.
    const basis = {
      tenantId: "11111111-1111-4111-8111-111111111111",
      wegId: "22222222-2222-4222-8222-222222222222",
      docTyp: "rechnung" as const,
      dokumentId: "33333333-3333-4333-8333-333333333333",
      dateiname: "Wartung.pdf",
    };

    const v1 = baueStoragePfad({ ...basis, versionNo: 1 });
    const v2 = baueStoragePfad({ ...basis, versionNo: 2 });

    expect(v1).not.toBe(v2);
    expect(v2).toBe(
      "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/rechnung/33333333-3333-4333-8333-333333333333-v2.pdf",
    );
  });

  it("nimmt die Endung aus dem Dateinamen und nichts sonst", () => {
    // Ein Dateiname aus dem Browser ist Nutzereingabe. Nur die Endung wird
    // uebernommen, der Rest des Namens landet nie im Pfad.
    expect(
      baueStoragePfad({
        tenantId: "11111111-1111-4111-8111-111111111111",
        wegId: "22222222-2222-4222-8222-222222222222",
        docTyp: "doku",
        dokumentId: "33333333-3333-4333-8333-333333333333",
        versionNo: 1,
        dateiname: "../../etc/passwd.pdf",
      }),
    ).toContain("/doku/33333333-3333-4333-8333-333333333333-v1.pdf");
  });
});
