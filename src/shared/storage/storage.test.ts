import { it, expect, vi } from "vitest";
import { readStored, writeStored, storageKey } from "./storage";
it("handles corrupt JSON and failed writes without crashing", () => {
  localStorage.setItem("broken", "{");
  expect(readStored("broken", [])).toEqual([]);
  const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("full");
  });
  expect(writeStored("draft", {})).toBe(false);
  spy.mockRestore();
});
it("keeps account, organization, project and team storage separate", () => {
  expect(storageKey("a:org:p:team", "draft")).not.toBe(
    storageKey("b:org:p:team", "draft"),
  );
  expect(storageKey("a:org:p:team", "draft")).not.toBe(
    storageKey("a:org:q:team", "draft"),
  );
});
