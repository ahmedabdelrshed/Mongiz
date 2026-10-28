import { beforeEach, expect, it, vi } from "vitest";
import { tonely } from "tonely";
import { playSound, setSoundsEnabled, SOUND_KEY, syncSounds } from "./sounds";

vi.mock("tonely", () => ({
  tonely: { success: vi.fn().mockResolvedValue(true), error: vi.fn().mockResolvedValue(true), warning: vi.fn().mockResolvedValue(true) },
}));

beforeEach(() => {
  localStorage.clear();
  syncSounds();
  vi.clearAllMocks();
});

it("only plays cues when enabled and restores the saved preference", () => {
  playSound("success");
  expect(tonely.success).not.toHaveBeenCalled();
  setSoundsEnabled(true);
  expect(localStorage.getItem(SOUND_KEY)).toBe("true");
  expect(syncSounds()).toBe(true);
  playSound("success");
  expect(tonely.success).toHaveBeenCalledOnce();
  setSoundsEnabled(false);
  playSound("error");
  expect(tonely.error).not.toHaveBeenCalled();
});

it("does not interrupt an action when audio fails", () => {
  setSoundsEnabled(true);
  vi.mocked(tonely.error).mockImplementationOnce(() => { throw new Error("audio unavailable"); });
  expect(() => playSound("error")).not.toThrow();
});
