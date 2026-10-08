import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { HoursSummary } from "./HoursSummary";

afterEach(() => vi.useRealTimers());

it("uses one capacity target when current-sprint work spans projects", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  render(
    <HoursSummary
      scope="hours-summary-multiple-projects"
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
        },
        {
          id: "billing-current",
          name: "Billing current",
          path: "Billing\\Sprint 12",
          project: "Billing",
          current: true,
          startDate: "2026-10-01",
        },
        {
          id: "portal-current",
          name: "Portal current",
          path: "Portal\\Sprint 12",
          project: "Portal",
          current: true,
          startDate: "2026-10-01",
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

  expect(screen.getAllByText("Target: 30–40h · Below target")).toHaveLength(3);
  expect(
    screen.getByRole("heading", { name: "Month · October 2026" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Estimated: 30h")).toBeInTheDocument();
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
  expect(screen.getByText("OMS · OMS next")).toBeInTheDocument();
  expect(screen.getByText("Estimated: 8h")).toBeInTheDocument();

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
  expect(screen.getAllByText("Estimated: 10h")).toHaveLength(2);

  await user.click(
    screen.getByRole("button", { name: "Calculation projects" }),
  );
  await user.click(
    within(
      screen.getByRole("dialog", { name: "Calculation projects options" }),
    ).getByText("OMS", { exact: true }),
  );
  expect(screen.getAllByText("Estimated: 10h")).toHaveLength(2);
});
