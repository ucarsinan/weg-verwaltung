import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockResolutionSingle = vi.fn();
const mockResolutionEq = vi.fn(() => ({ single: mockResolutionSingle }));
const mockResolutionSelect = vi.fn(() => ({ eq: mockResolutionEq }));
const mockMeetingSingle = vi.fn();
const mockMeetingEq = vi.fn(() => ({ single: mockMeetingSingle }));
const mockMeetingSelect = vi.fn(() => ({ eq: mockMeetingEq }));
const mockVoteUpsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      rpc: mockRpc,
      from: mockFrom,
    }),
  ),
}));

import { castVote, feststellenResolution } from "../actions";

const RESOLUTION_ID = "11111111-1111-1111-1111-111111111111";
const MEETING_ID = "22222222-2222-2222-2222-222222222222";
const TOP_ID = "33333333-3333-3333-3333-333333333333";
const OWNERSHIP_ID = "44444444-4444-4444-4444-444444444444";

function voteFormData() {
  const formData = new FormData();
  formData.set("ownership_id", OWNERSHIP_ID);
  formData.set("wert", "ja");
  return formData;
}

describe("feststellenResolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "resolution") {
        return { select: mockResolutionSelect };
      }
      if (table === "meeting") {
        return { select: mockMeetingSelect };
      }
      if (table === "vote") {
        return { upsert: mockVoteUpsert };
      }
      return {};
    });
  });

  it("uses the atomic feststellen_resolution RPC", async () => {
    await feststellenResolution(RESOLUTION_ID, MEETING_ID, TOP_ID, {}, new FormData());

    expect(mockRpc).toHaveBeenCalledWith("feststellen_resolution", {
      p_resolution_id: RESOLUTION_ID,
    });
    expect(mockFrom).not.toHaveBeenCalledWith("beschluss_sammlung_entry");
    expect(redirect).toHaveBeenCalledWith(
      `/versammlungen/${MEETING_ID}/tops/${TOP_ID}/abstimmung`,
    );
  });

  it("returns a visible error when the RPC rejects duplicate finalization", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23505", hint: "", message: "duplicate" },
    });

    const result = await feststellenResolution(
      RESOLUTION_ID,
      MEETING_ID,
      TOP_ID,
      {},
      new FormData(),
    );

    expect(result.error).toMatch(/bereits festgestellt/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns a visible generic error when the RPC rejects invalid finalization data", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23514", hint: "", message: "invalid ownership basis" },
    });

    const result = await feststellenResolution(
      RESOLUTION_ID,
      MEETING_ID,
      TOP_ID,
      {},
      new FormData(),
    );

    expect(result.error).toMatch(/konnte nicht festgestellt werden/);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("castVote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolutionSingle.mockResolvedValue({
      data: { id: RESOLUTION_ID, festgestellt_am: null },
      error: null,
    });
    mockMeetingSingle.mockResolvedValue({
      data: { id: MEETING_ID, status: "laufend" },
      error: null,
    });
    mockVoteUpsert.mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "resolution") {
        return { select: mockResolutionSelect };
      }
      if (table === "meeting") {
        return { select: mockMeetingSelect };
      }
      if (table === "vote") {
        return { upsert: mockVoteUpsert };
      }
      return {};
    });
  });

  it("upserts a vote while the resolution is open", async () => {
    await castVote(RESOLUTION_ID, MEETING_ID, TOP_ID, voteFormData());

    expect(mockVoteUpsert).toHaveBeenCalledWith(
      {
        resolution_id: RESOLUTION_ID,
        ownership_id: OWNERSHIP_ID,
        wert: "ja",
        quelle: "praesenz",
      },
      { onConflict: "tenant_id,resolution_id,ownership_id" },
    );
  });

  it("blocks votes after Feststellung before reaching the vote upsert", async () => {
    mockResolutionSingle.mockResolvedValue({
      data: { id: RESOLUTION_ID, festgestellt_am: "2026-06-17T10:00:00Z" },
      error: null,
    });

    await castVote(RESOLUTION_ID, MEETING_ID, TOP_ID, voteFormData());

    expect(mockVoteUpsert).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("blocks votes before the meeting is laufend", async () => {
    mockMeetingSingle.mockResolvedValue({
      data: { id: MEETING_ID, status: "entwurf" },
      error: null,
    });

    await castVote(RESOLUTION_ID, MEETING_ID, TOP_ID, voteFormData());

    expect(mockVoteUpsert).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
