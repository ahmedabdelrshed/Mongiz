import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { HoursSummary } from "./HoursSummary";
import type { Iteration, WorkItem } from "../../shared/api/types";

afterEach(() => vi.useRealTimers());

it("uses one capacity target when current-sprint work spans projects", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  render(
    <HoursSummary
      target={{ min: 30, max: 40 }}
      setTarget={vi.fn()}
      owner="ahmed@example.com"
      people={[]}
      iterations={[
        {
          id: "oms-current",
          name: "OMS current",
          path: "OMS\\Sprint 12",
          project: "OMS",
          current: true,
          startDate: "2026-10-01",
          finishDate: "2026-10-14",
        },
        {
          id: "billing-current",
          name: "Billing current",
          path: "Billing\\Sprint 12",
          project: "Billing",
          current: true,
          startDate: "2026-10-01",
          finishDate: "2026-10-14",
        },
        {
          id: "portal-current",
          name: "Portal current",
          path: "Portal\\Sprint 12",
          project: "Portal",
          current: true,
          startDate: "2026-10-01",
          finishDate: "2026-10-14",
        },
        {
          id: "oms-next",
          name: "OMS next",
          path: "OMS\\Sprint 13",
          project: "OMS",
          startDate: "2026-11-01",
        },
      ]}
      items={[
        {
          id: 1,
          rev: 1,
          title: "OMS task",
          type: "Task",
          state: "Active",
          assignedTo: "ahmed@example.com",
          iteration: "OMS\\Sprint 12",
          estimate: 10,
        },
        {
          id: 2,
          rev: 1,
          title: "Billing task",
          type: "Task",
          state: "Active",
          assignedTo: "ahmed@example.com",
          iteration: "Billing\\Sprint 12",
          estimate: 10,
        },
        {
          id: 3,
          rev: 1,
          title: "Portal task",
          type: "Task",
          state: "Active",
          assignedTo: "ahmed@example.com",
          iteration: "Portal\\Sprint 12",
          estimate: 10,
        },
        {
          id: 4,
          rev: 1,
          title: "OMS next task",
          type: "Task",
          state: "Active",
          assignedTo: "ahmed@example.com",
          iteration: "OMS\\Sprint 13",
          estimate: 8,
        },
      ]}
    />,
  );
  vi.useRealTimers();
  const user = userEvent.setup();

  const combined = screen
    .getByRole("heading", { name: "Current sprint" })
    .closest("article")!;
  expect(within(combined).getByText("Estimated: 30h")).toBeInTheDocument();
  expect(
    within(combined).getByText("Target: 30–40h · Within target"),
  ).toBeInTheDocument();
  for (const name of ["OMS", "Billing", "Portal"]) {
    const project = screen.getByRole("article", { name });
    expect(within(project).getByText("Estimated: 10h")).toBeInTheDocument();
  }
  await user.click(screen.getByText("Month totals"));
  expect(
    screen.getByRole("heading", { name: "Month · October 2026" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Estimated: 30h")).toHaveLength(2);
  expect(
    screen.getByText("Target: 120–160h · Below target"),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Calculation sprints" }));
  const sprints = screen.getByRole("dialog", {
    name: "Calculation sprints options",
  });
  await user.type(
    within(sprints).getByLabelText("Search Calculation sprints"),
    "next",
  );
  await user.click(
    within(sprints).getByText("OMS · OMS next", { exact: true }),
  );
  await user.keyboard("{Escape}");
  expect(
    screen.getByRole("heading", { name: "Selected sprints" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Estimated: 38h")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Calculation months" }));
  const months = screen.getByRole("dialog", {
    name: "Calculation months options",
  });
  await user.type(
    within(months).getByLabelText("Search Calculation months"),
    "November",
  );
  await user.click(within(months).getByText("November 2026", { exact: true }));
  await user.keyboard("{Escape}");
  expect(
    screen.getByRole("heading", { name: "Month · November 2026" }),
  ).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Calculation projects" }),
  );
  const menu = screen.getByRole("dialog", {
    name: "Calculation projects options",
  });
  await user.type(
    within(menu).getByLabelText("Search Calculation projects"),
    "Bill",
  );
  await user.click(within(menu).getByText("Billing", { exact: true }));
  await user.keyboard("{Escape}");
  expect(within(combined).getByText("Estimated: 10h")).toBeInTheDocument();
  expect(
    screen.queryByRole("article", { name: "OMS" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Billing" })).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Calculation projects" }),
  );
  await user.click(
    within(
      screen.getByRole("dialog", { name: "Calculation projects options" }),
    ).getByText("OMS", { exact: true }),
  );
  expect(screen.getAllByText("Estimated: 20h")).toHaveLength(2);
});

function summaryFixture(iterations: Iteration[], items: WorkItem[]) {
  return (
    <HoursSummary
      target={{ min: 30, max: 40 }}
      setTarget={vi.fn()}
      owner="ahmed@example.com"
      people={[]}
      iterations={iterations}
      items={items}
    />
  );
}
function sprint(
  id: string,
  project: string,
  startDate?: string,
  finishDate?: string,
): Iteration {
  return {
    id,
    name: id,
    path: `${project}\\${id}`,
    project,
    startDate,
    finishDate,
    current: true,
  };
}
function work(
  id: number,
  iteration: Iteration,
  estimate: number,
  completed = 1,
): WorkItem {
  return {
    id,
    rev: 1,
    title: `Task ${id}`,
    type: "Task",
    state: "Closed",
    assignedTo: "ahmed@example.com",
    project: iteration.project,
    iteration: iteration.path,
    estimate,
    completed,
  };
}

it("combines only sprints containing 12 May across all projects, with inclusive dates and no duplicate tasks", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 12, 12));
  const iterations = [
    {
      ...sprint("May sprint", "OMS", "2026-05-04", "2026-05-17"),
      current: false,
    },
    sprint("Work week", "Billing", "2026-05-11", "2026-05-15"),
    sprint("Past", "Portal", "2026-05-01", "2026-05-10"),
    sprint("Future", "OMS", "2026-05-18", "2026-05-31"),
    sprint("Unknown", "Portal"),
    sprint("Boundary", "Boundary", "2026-05-12", "2026-05-12"),
    sprint("Cross month", "Other", "2026-04-27", "2026-05-13"),
    sprint("Incomplete", "Portal", "2026-05-01"),
    sprint("Invalid", "Portal", "invalid", "2026-05-31"),
  ];
  const items = iterations.map((iteration, index) =>
    work(index + 1, iteration, [8, 4, 100, 200, 300, 2, 3, 400, 500][index]),
  );
  items.push({
    ...work(99, iterations[0], 1000),
    assignedTo: "sara@example.com",
  });
  render(summaryFixture([...iterations, iterations[0]], items));
  const current = screen
    .getByRole("heading", { name: "Current sprint" })
    .closest("article")!;
  expect(within(current).getByText("Estimated: 17h")).toBeInTheDocument();
  expect(within(current).getByText("Completed: 4h")).toBeInTheDocument();
  expect(
    within(current).getByText("4 tasks · 0 without estimates"),
  ).toBeInTheDocument();
  for (const [name, estimate] of [
    ["OMS", 8],
    ["Billing", 4],
    ["Boundary", 2],
    ["Other", 3],
  ] as const) {
    expect(
      within(screen.getByRole("article", { name })).getByText(
        `Estimated: ${estimate}h`,
      ),
    ).toBeInTheDocument();
  }
  expect(
    screen.queryByRole("article", { name: "Portal" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Sprints containing today \(12\/05\/2026\): 4/),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Month totals").closest("details"),
  ).not.toHaveAttribute("open");
  act(() => {
    vi.setSystemTime(new Date(2026, 4, 13, 12));
    fireEvent(window, new Event("focus"));
  });
  expect(within(current).getByText("Estimated: 15h")).toBeInTheDocument();
  expect(
    screen.queryByRole("article", { name: "Boundary" }),
  ).not.toBeInTheDocument();
  act(() => {
    vi.setSystemTime(new Date(2026, 4, 14, 12));
    fireEvent(window, new Event("focus"));
  });
  expect(within(current).getByText("Estimated: 12h")).toBeInTheDocument();
});

it("advances the current total at local midnight and shows unavailable when no date range matches", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 12, 23, 59, 59));
  const iterations = [
    sprint("Today", "OMS", "2026-05-12", "2026-05-12"),
    sprint("Tomorrow", "Other", "2026-05-13", "2026-05-13"),
  ];
  render(
    summaryFixture(iterations, [
      work(1, iterations[0], 5),
      work(2, iterations[1], 9),
    ]),
  );
  const current = screen
    .getByRole("heading", { name: "Current sprint" })
    .closest("article")!;
  expect(within(current).getByText("Estimated: 5h")).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(1021);
  });
  expect(within(current).getByText("Estimated: 9h")).toBeInTheDocument();
  act(() => {
    vi.setSystemTime(new Date(2026, 4, 14, 12));
    fireEvent(window, new Event("focus"));
  });
  expect(
    within(current).getByText(/No sprint date range contains 14\/05\/2026/),
  ).toBeInTheDocument();
  expect(within(current).queryByText(/Estimated:/)).not.toBeInTheDocument();
});
