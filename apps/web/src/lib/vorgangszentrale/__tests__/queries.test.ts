import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listReviewItems, listVorgaenge } from "../queries";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

type QueryError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

describe("vorgangszentrale queries", () => {
  beforeEach(() => {
    mocks.createClient.mockResolvedValue({ from: mocks.from });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("downgrades missing Vorgangszentrale tables to a warning", async () => {
    mocks.from.mockReturnValue(
      createQueryError({
        code: "PGRST205",
        message: "Could not find the table 'public.vorgang' in the schema cache",
      }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await listVorgaenge();

    expect(result).toEqual({
      data: [],
      error: "Die Vorgangszentrale-Tabellen sind in der Datenbank noch nicht verfügbar.",
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[vorgangszentrale] listVorgaenge unavailable",
      expect.objectContaining({
        code: "PGRST205",
        message: "Could not find the table 'public.vorgang' in the schema cache",
      }),
    );
  });

  it("keeps unexpected query failures as errors", async () => {
    mocks.from.mockReturnValue(
      createQueryError({
        code: "42501",
        message: "permission denied for table vorgang",
      }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await listVorgaenge();

    expect(result).toEqual({
      data: [],
      error: "Daten der Vorgangszentrale konnten nicht geladen werden.",
    });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "[vorgangszentrale] listVorgaenge failed",
      expect.objectContaining({
        code: "42501",
        message: "permission denied for table vorgang",
      }),
    );
  });

  it("falls back when the cloud schema has no agent_suggestion.vorgang_id column yet", async () => {
    mocks.from
      .mockReturnValueOnce(
        createQueryError({
          code: "PGRST204",
          message:
            "Could not find the 'vorgang_id' column of 'agent_suggestion' in the schema cache",
        }),
      )
      .mockReturnValueOnce(
        createQueryResult([
          {
            id: "suggestion-1",
            vorschlag_typ: "vorgang_triage",
            status: "vorschlag",
            weg_id: "weg-1",
            payload: {
              title: "Hausgeld prüfen",
              summary: "Bitte vor Freigabe prüfen.",
              vorgang_id: "vorgang-1",
              confidence: "hoch",
            },
            langfuse_trace_id: null,
            langgraph_thread_id: null,
            created_at: "2026-06-22T10:00:00.000Z",
            updated_at: "2026-06-22T10:00:00.000Z",
          },
          {
            id: "suggestion-2",
            vorschlag_typ: "vorgang_triage",
            status: "vorschlag",
            weg_id: "weg-1",
            payload: {
              title: "Anderer Vorgang",
              vorgang_id: "vorgang-2",
            },
            created_at: "2026-06-22T11:00:00.000Z",
            updated_at: "2026-06-22T11:00:00.000Z",
          },
        ]),
      )
      .mockReturnValueOnce(createQueryResult([{ id: "weg-1", name: "WEG Mitte" }]));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await listReviewItems({ vorgangId: "vorgang-1" });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "suggestion-1",
      title: "Hausgeld prüfen",
      vorgangId: "vorgang-1",
      wegName: "WEG Mitte",
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[vorgangszentrale] listReviewItems schema fallback",
      expect.objectContaining({
        code: "PGRST204",
        message:
          "Could not find the 'vorgang_id' column of 'agent_suggestion' in the schema cache",
      }),
    );
  });
});

function createQueryError(error: QueryError) {
  return createQueryResponse(null, error);
}

function createQueryResult(data: unknown[]) {
  return createQueryResponse(data, null);
}

function createQueryResponse(data: unknown[] | null, error: QueryError | null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: vi.fn((resolve, reject) =>
      Promise.resolve({ data, error }).then(resolve, reject),
    ),
  };

  return query;
}
