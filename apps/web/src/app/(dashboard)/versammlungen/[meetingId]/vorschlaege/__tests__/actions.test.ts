import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock before importing the module under test.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockUpdate = vi.fn();
const mockEqStatus = vi.fn();
const mockEqId = vi.fn();

// Chain: .from().update().eq("id", ...).eq("status", ...)
mockEqStatus.mockResolvedValue({ error: null });
mockEqId.mockReturnValue({ eq: mockEqStatus });
mockUpdate.mockReturnValue({ eq: mockEqId });

const mockFrom = vi.fn(() => ({ update: mockUpdate }));
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ from: mockFrom, auth: { getUser: mockGetUser } }),
  ),
}));

// Import AFTER mocks are in place.
import { acceptSuggestion, rejectSuggestion } from "../actions";

const MEETING_ID = "11111111-1111-1111-1111-111111111111";
const SUGGESTION_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";

describe("acceptSuggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockEqStatus.mockResolvedValue({ error: null });
    mockEqId.mockReturnValue({ eq: mockEqStatus });
    mockUpdate.mockReturnValue({ eq: mockEqId });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  it("returns error when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await acceptSuggestion(MEETING_ID, SUGGESTION_ID);
    expect(result.error).toBe("Nicht authentifiziert.");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("calls update with correct shape on valid input", async () => {
    const result = await acceptSuggestion(MEETING_ID, SUGGESTION_ID);

    expect(result.error).toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith("agent_suggestion");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "uebernommen",
        entschieden_von: USER_ID,
      }),
    );
    expect(mockEqId).toHaveBeenCalledWith("id", SUGGESTION_ID);
    expect(mockEqStatus).toHaveBeenCalledWith("status", "vorschlag");
  });

  it("returns error when DB update fails", async () => {
    mockEqStatus.mockResolvedValue({
      error: { code: "42501", hint: "permission denied" },
    });

    const result = await acceptSuggestion(MEETING_ID, SUGGESTION_ID);
    expect(result.error).toBeDefined();
  });

  it("no-op guard: only updates rows where status = vorschlag", async () => {
    await acceptSuggestion(MEETING_ID, SUGGESTION_ID);
    expect(mockEqStatus).toHaveBeenCalledWith("status", "vorschlag");
  });
});

describe("rejectSuggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockEqStatus.mockResolvedValue({ error: null });
    mockEqId.mockReturnValue({ eq: mockEqStatus });
    mockUpdate.mockReturnValue({ eq: mockEqId });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  it("returns error when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await rejectSuggestion(MEETING_ID, SUGGESTION_ID);
    expect(result.error).toBe("Nicht authentifiziert.");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("calls update with correct shape on valid input", async () => {
    const result = await rejectSuggestion(MEETING_ID, SUGGESTION_ID);

    expect(result.error).toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith("agent_suggestion");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "verworfen",
        entschieden_von: USER_ID,
      }),
    );
    expect(mockEqId).toHaveBeenCalledWith("id", SUGGESTION_ID);
    expect(mockEqStatus).toHaveBeenCalledWith("status", "vorschlag");
  });

  it("returns error when DB update fails", async () => {
    mockEqStatus.mockResolvedValue({
      error: { code: "42501", hint: "permission denied" },
    });

    const result = await rejectSuggestion(MEETING_ID, SUGGESTION_ID);
    expect(result.error).toBeDefined();
  });

  it("no-op guard: only updates rows where status = vorschlag", async () => {
    await rejectSuggestion(MEETING_ID, SUGGESTION_ID);
    expect(mockEqStatus).toHaveBeenCalledWith("status", "vorschlag");
  });
});
