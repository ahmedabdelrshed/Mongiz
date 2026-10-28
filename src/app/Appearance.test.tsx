import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  APPEARANCE_KEY,
  AppearanceProvider,
  AppearanceSettings,
} from "./Appearance";
import { SOUND_KEY, syncSounds } from "../shared/ui/sounds";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(SOUND_KEY);
  syncSounds();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
});

it("lets users enable and disable sound feedback", async () => {
  const user = userEvent.setup();
  const view = setup();
  const checkbox = screen.getByRole("checkbox", { name: /sound feedback/i });
  expect(checkbox).not.toBeChecked();
  await user.click(checkbox);
  expect(localStorage.getItem(SOUND_KEY)).toBe("true");
  view.unmount();
  setup();
  expect(screen.getByRole("checkbox", { name: /sound feedback/i })).toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: /sound feedback/i }));
  expect(localStorage.getItem(SOUND_KEY)).toBe("false");
});
const setup = () =>
  render(
    <AppearanceProvider>
      <AppearanceSettings />
    </AppearanceProvider>,
  );

it("saves an explicit appearance and restores it on the next visit", async () => {
  const user = userEvent.setup();
  const view = setup();
  expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "Dark" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem(APPEARANCE_KEY)).toBe('"dark"');
  view.unmount();
  setup();
  expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(document.documentElement.style.colorScheme).toBe("dark");
});

it("follows device changes only while system appearance is selected", async () => {
  let dark = false;
  const listeners = new Set<() => void>();
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        media: query,
        get matches() {
          return dark;
        },
        onchange: null,
        addEventListener: (_type: string, listener: unknown) =>
          listeners.add(listener as () => void),
        removeEventListener: (_type: string, listener: unknown) =>
          listeners.delete(listener as () => void),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList,
  );
  const user = userEvent.setup();
  setup();
  act(() => {
    dark = true;
    listeners.forEach((listener) => listener());
  });
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  await user.click(screen.getByRole("button", { name: "Light" }));
  act(() => {
    dark = false;
    listeners.forEach((listener) => listener());
    dark = true;
    listeners.forEach((listener) => listener());
  });
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  await user.click(screen.getByRole("button", { name: "System" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
});

it("recovers invalid preferences and applies appearance when browser storage cannot be written", async () => {
  localStorage.setItem(APPEARANCE_KEY, '"invalid"');
  const user = userEvent.setup();
  setup();
  expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  await user.click(screen.getByRole("button", { name: "Dark" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Appearance changed for this visit",
  );
});
