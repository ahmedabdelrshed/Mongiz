import { tonely } from "tonely";
import { readStored, writeStored } from "../storage/storage";

export const SOUND_KEY = "taskflow:v1:sounds";
const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";
let enabled = readStored(SOUND_KEY, false, isBoolean);

export function soundsEnabled() {
  return enabled;
}
export function setSoundsEnabled(value: boolean) {
  enabled = value;
  return writeStored(SOUND_KEY, value);
}
export function syncSounds() {
  enabled = readStored(SOUND_KEY, false, isBoolean);
  return enabled;
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === SOUND_KEY || event.key === null) syncSounds();
  });
}
export function playSound(cue: "success" | "error" | "warning") {
  if (!enabled) return;
  // Audio is optional and must never interfere with the action.
  try {
    void tonely[cue]({ theme: "minimal", volume: 0.3 }).catch(() => {});
  } catch {
    /* Web Audio may be unavailable. */
  }
}
