import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StartupSplash } from "./StartupSplash";

afterEach(() => vi.useRealTimers());

it("shows the icon for 500ms in StrictMode, then keeps the workspace visible across navigation", () => {
  vi.useFakeTimers();
  const view = render(
    <StrictMode>
      <StartupSplash>
        <h1>Workspace</h1>
      </StartupSplash>
    </StrictMode>,
  );
  expect(
    screen.getByRole("status", { name: "Opening Mongiz" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Workspace" }),
  ).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(499));
  expect(
    screen.getByRole("status", { name: "Opening Mongiz" }),
  ).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(
    screen.queryByRole("status", { name: "Opening Mongiz" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Workspace" }),
  ).toBeInTheDocument();
  view.rerender(
    <StrictMode>
      <StartupSplash>
        <h1>Next page</h1>
      </StartupSplash>
    </StrictMode>,
  );
  expect(
    screen.getByRole("heading", { name: "Next page" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("status", { name: "Opening Mongiz" }),
  ).not.toBeInTheDocument();
});
