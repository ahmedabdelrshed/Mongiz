import { expect, it } from "vitest";
import { owns, sprintMatches, hourTotals, monthSprints } from "./filters";
import {
  isIterationCurrent,
  type WorkItem,
  type Iteration,
} from "../../shared/api/types";
const item: WorkItem = {
  id: 1,
  rev: 1,
  title: "Task",
  type: "Task",
  assignedTo: "Ahmed@Company.com",
  state: "Active",
  iteration: "OMS\\Sprint 1",
  estimate: 35,
  completed: 12,
};
const iterations: Iteration[] = [
  {
    id: "1",
    name: "Sprint 1",
    path: "OMS\\Sprint 1",
    current: true,
    startDate: "2026-10-01T00:00:00Z",
  },
  {
    id: "2",
    name: "Sprint 2",
    path: "OMS\\Sprint 2",
    startDate: "2026-10-15T00:00:00Z",
  },
  {
    id: "3",
    name: "Sprint 3",
    path: "OMS\\Sprint 3",
    startDate: "2026-11-01T00:00:00Z",
  },
];
it("matches the token owner, another identity, all users and exact sprint paths", () => {
  expect(owns(item, "mine", "ahmed@company.com")).toBe(true);
  expect(owns(item, "sara@company.com", "ahmed@company.com")).toBe(false);
  expect(owns({ ...item, assignedTo: "" }, "all", "ahmed@company.com")).toBe(
    true,
  );
  expect(sprintMatches(item, "current", iterations, "OMS")).toBe(true);
  expect(sprintMatches(item, iterations[1].path, iterations, "OMS")).toBe(
    false,
  );
  expect(sprintMatches(item, "current", [], "OMS")).toBe(false);
  expect(sprintMatches(item, "all", [], "OMS")).toBe(true);
});
it("uses inclusive sprint date ranges as the source of truth for current status", () => {
  const sprint: Iteration = {
    id: "dated",
    name: "Dated sprint",
    path: "OMS\\Dated",
    current: false,
    startDate: "2026-10-01T00:00:00Z",
    finishDate: "2026-10-14T00:00:00Z",
  };
  expect(isIterationCurrent(sprint, new Date("2026-10-01T12:00:00Z"))).toBe(
    true,
  );
  expect(isIterationCurrent(sprint, new Date("2026-10-14T12:00:00Z"))).toBe(
    true,
  );
  expect(isIterationCurrent(sprint, new Date("2026-10-15T12:00:00Z"))).toBe(
    false,
  );
});
it("sums task numbers without NaN propagation and rounds decimal hours", () => {
  expect(
    hourTotals([
      item,
      { ...item, id: 2, estimate: 0.1, completed: 0.2 },
      { ...item, id: 3, estimate: undefined, completed: NaN },
    ]),
  ).toEqual({ estimate: 35.1, completed: 12.2, unestimated: 1 });
});
it("uses sprint start months, deduplicates paths and declines unknown or ambiguous months", () => {
  expect(
    monthSprints([iterations[0]], [...iterations, iterations[0]])?.sprints.map(
      (i) => i.id,
    ),
  ).toEqual(["1", "2"]);
  expect(monthSprints([iterations[0]], iterations)?.month).toBe("2026-10");
  expect(
    monthSprints([iterations[0], iterations[2]], iterations),
  ).toBeUndefined();
  expect(
    monthSprints([{ ...iterations[0], startDate: undefined }], iterations),
  ).toBeUndefined();
  expect(monthSprints([], iterations)).toBeUndefined();
});
