import { describe, expect, it } from "vitest";
import type { WorkItem } from "../../shared/api/types";
import { groupWorkItems, matchesWorkSearch } from "./workGroups";

const story: WorkItem = {
  id: 10,
  rev: 1,
  title: "Search device history",
  type: "User Story",
  state: "Active",
  assignedTo: "sara",
  iteration: "Sprint 1",
};
const tasks: WorkItem[] = [
  {
    ...story,
    id: 11,
    parentId: 10,
    title: "Implement frontend",
    type: "Task",
    assignedTo: "ahmed",
  },
  {
    ...story,
    id: 12,
    parentId: 10,
    title: "Unit testing",
    type: "Task",
    state: "Closed",
  },
  {
    ...story,
    id: 13,
    parentId: 10,
    title: "Code review",
    type: "Task",
    iteration: "Sprint 2",
  },
  {
    ...story,
    id: 14,
    parentId: 99,
    title: "Independent testing",
    type: "Task",
  },
];
const group = (
  search: string,
  matchesFilters = (_item: WorkItem) => true,
  plannedIds?: number[],
) =>
  groupWorkItems({
    stories: [story],
    tasks,
    search,
    matchesFilters,
    plannedIds,
  });

describe("work search", () => {
  it("trims whitespace, ignores case and accepts plain or prefixed IDs", () => {
    for (const search of ["  DEVICE HISTORY  ", "10", " #10 ", "  "])
      expect(matchesWorkSearch(story, search)).toBe(true);
    expect(matchesWorkSearch(story, "#999")).toBe(false);
    expect(matchesWorkSearch(story, "missing")).toBe(false);
  });
  it("shows filtered children when the parent matches, even with a different owner", () => {
    const groups = group(
      " #10 ",
      (item) => item.assignedTo === "ahmed" && item.iteration === "Sprint 1",
    );
    expect(groups).toEqual([{ story, tasks: [tasks[0]] }]);
    expect(
      group("device history", (item) => item.state === "Closed")[0].tasks,
    ).toEqual([tasks[1]]);
  });
  it("retains parent context for matching tasks and handles missing parents", () => {
    expect(group("frontend")).toEqual([{ story, tasks: [tasks[0]] }]);
    expect(group(" #14 ")).toEqual([{ tasks: [tasks[3]] }]);
    expect(group("missing")).toEqual([]);
  });
  it("clears back to all results and enforces Today's plan membership", () => {
    expect(group("").flatMap((g) => g.tasks)).toEqual(tasks);
    expect(group("history", undefined, [12])).toEqual([
      { story, tasks: [tasks[1]] },
    ]);
    expect(group("history", undefined, [])).toEqual([]);
    expect(group("frontend", undefined, [12])).toEqual([]);
  });
  it("keeps parent context for task-only results and omits tasks for parent-only results", () => {
    expect(groupWorkItems({ stories: [story], tasks, search: "frontend", matchesFilters: () => true, includeStory: () => false })).toEqual([
      { story, tasks: [tasks[0]], contextOnly: true },
    ]);
    expect(groupWorkItems({ stories: [story], tasks, search: "", matchesFilters: () => true, includeTasks: false })).toEqual([
      { story, tasks: [] },
    ]);
  });
});
