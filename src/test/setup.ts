import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Node can expose an incomplete experimental localStorage in the test worker.
// Keep test storage deterministic and browser-compatible.
const entries = new Map<string, string>();
const testStorage: Storage = {
  get length() {
    return entries.size;
  },
  clear: () => entries.clear(),
  getItem: (key) => entries.get(key) ?? null,
  key: (index) => [...entries.keys()][index] ?? null,
  removeItem: (key) => entries.delete(key),
  setItem: (key, value) => entries.set(String(key), String(value)),
};
vi.stubGlobal("localStorage", testStorage);

afterEach(() => {
  cleanup();
  testStorage.clear();
});

// JSDOM has no layout engine; Chromium e2e tests cover actual row measurement.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// cmdk scrolls the active option into view. JSDOM does not implement it.
HTMLElement.prototype.scrollIntoView = vi.fn();
