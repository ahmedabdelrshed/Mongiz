import { expect, it, vi } from "vitest";
import {
  buildMovePlan,
  changedItems,
  executeMove,
  filterStories,
  type MoveResult,
} from "./model";
import type { WorkItem } from "../../shared/api/types";

const config = { storyType: "User Story", taskType: "Task" };
const story: WorkItem = {
  id: 1,
  rev: 3,
  project: "OMS",
  title: "Search history",
  type: "User Story",
  state: "Active",
  assignedTo: "owner",
  iteration: "OMS\\Old",
  isStory: true,
};
const task = (id: number, state = "Active"): WorkItem => ({
  ...story,
  id,
  type: "Task",
  isStory: false,
  isTask: true,
  title: `Task ${id}`,
  state,
  parentId: 1,
  assignedTo: "someone else",
  iteration: "OMS\\Another",
});
const input = (items: WorkItem[] = [story, task(2), task(3, "Closed")]) => ({
  project: "OMS",
  items,
  storyIds: [1],
  destination: "OMS\\New",
  taskStates: ["Active"],
  config,
});

it("combines case-insensitive title/ID search, story status and exact source iteration", () => {
  const other = {
    ...story,
    id: 12,
    title: "Other story",
    state: "New",
    iteration: "OMS",
  };
  expect(
    filterStories([story, other], "SEARCH", ["Active"], "OMS\\Old"),
  ).toEqual([story]);
  expect(filterStories([story, other], "12", ["all"], "all")).toEqual([other]);
  expect(filterStories([story], "search", ["New"], "all")).toEqual([]);
  expect(filterStories([story], "", ["all"], "OMS")).toEqual([]);
});
it("moves only stories when no task statuses are selected", () => {
  expect(
    changedItems(buildMovePlan({ ...input(), taskStates: [] })).map(
      (i) => i.id,
    ),
  ).toEqual([1]);
});
it("includes selected task statuses across users/iterations, including Closed only when selected", () => {
  expect(changedItems(buildMovePlan(input())).map((i) => i.id)).toEqual([1, 2]);
  expect(
    changedItems(
      buildMovePlan({ ...input(), taskStates: ["Active", "Closed"] }),
    ).map((i) => i.id),
  ).toEqual([1, 2, 3]);
});
it("deduplicates stories/tasks and excludes foreign project tasks and deeper descendants", () => {
  const items = [
    story,
    story,
    task(2),
    task(2),
    { ...task(3), project: "Other" },
    { ...task(4), parentId: 2 },
  ];
  expect(
    changedItems(buildMovePlan({ ...input(items), storyIds: [1, 1] })).map(
      (i) => i.id,
    ),
  ).toEqual([1, 2]);
});
it("rejects cross-project destinations and selected foreign stories", () => {
  expect(() =>
    buildMovePlan({ ...input(), destination: "Other\\Sprint" }),
  ).toThrow(/selected project/);
  expect(() => buildMovePlan(input([{ ...story, project: "Other" }]))).toThrow(
    /selected project/,
  );
});
it("supports the project root and process-specific story/task types", () => {
  const plan = buildMovePlan({
    ...input([
      { ...story, isStory: undefined, type: "Product Backlog Item" },
      { ...task(2), isTask: undefined, type: "Custom Task" },
    ]),
    destination: "OMS",
    config: {
      ...config,
      storyTypes: ["Product Backlog Item"],
      taskTypes: ["Custom Task"],
    },
  });
  expect(changedItems(plan).map((i) => i.id)).toEqual([1, 2]);
});
it("skips items already in destination while still moving a story's eligible tasks", () => {
  const plan = buildMovePlan(
    input([
      { ...story, iteration: "OMS\\New" },
      task(2),
      { ...task(3), iteration: "OMS\\New" },
    ]),
  );
  expect(plan.groups[0].moveStory).toBe(false);
  expect(changedItems(plan).map((i) => i.id)).toEqual([2]);
  expect(plan.skipped.map((i) => i.id)).toEqual([3, 1]);
});
it("updates only iteration with the loaded revision, parent first, and preserves classification", async () => {
  const update = vi.fn(
    async (item: WorkItem, fields: Record<string, unknown>) => ({
      ...item,
      isStory: undefined,
      isTask: undefined,
      parentId: undefined,
      project: undefined,
      rev: item.rev + 1,
      iteration: String(fields["System.IterationPath"]),
    }),
  );
  const updated = vi.fn();
  const results = await executeMove(
    buildMovePlan(input()),
    { update },
    vi.fn(),
    updated,
  );
  expect(update.mock.calls.map(([i]) => i.id)).toEqual([1, 2]);
  expect(update.mock.calls[0]).toEqual([
    story,
    { "System.IterationPath": "OMS\\New" },
  ]);
  expect(results.every((r) => r.status === "moved")).toBe(true);
  expect(updated.mock.calls[1][0]).toMatchObject({
    parentId: 1,
    isTask: true,
    isStory: false,
    project: "OMS",
    rev: 4,
  });
});
it("skips a failed parent's tasks and continues with other stories", async () => {
  const second = { ...story, id: 5 };
  const plan = buildMovePlan({
    ...input([story, task(2), second, { ...task(6), parentId: 5 }]),
    storyIds: [1, 5],
  });
  const update = vi.fn(async (item: WorkItem) => {
    if (item.id === 1) throw new Error("Revision conflict");
    return { ...item, rev: item.rev + 1, iteration: plan.destination };
  });
  const results = await executeMove(plan, { update }, vi.fn(), vi.fn());
  expect(update.mock.calls.map(([i]) => i.id)).toEqual([1, 5, 6]);
  expect(results[0]).toMatchObject({
    status: "failed",
    retryable: true,
    message: "Revision conflict",
  });
  expect(results[1]).toMatchObject({
    status: "skipped",
    retryable: true,
    storyId: 1,
  });
});
it("retains partial successes and rebuilds retries with fresh revisions and eligible statuses only", async () => {
  const original = input([story, task(2), task(3)]);
  const update = vi.fn(async (item: WorkItem) => {
    if (item.id === 2) throw new Error("Denied");
    return { ...item, iteration: original.destination, rev: item.rev + 1 };
  });
  const results: MoveResult[] = await executeMove(
    buildMovePlan(original),
    { update },
    vi.fn(),
    vi.fn(),
  );
  expect(results.map((r) => r.status)).toEqual(["moved", "failed", "moved"]);
  const retry = buildMovePlan({
    ...original,
    items: [
      { ...story, iteration: original.destination, rev: 4 },
      { ...task(2), rev: 9 },
      { ...task(3), iteration: original.destination },
    ],
    pendingIds: results.filter((r) => r.retryable).map((r) => r.item.id),
  });
  expect(changedItems(retry)).toEqual([{ ...task(2), rev: 9 }]);
  expect(
    changedItems(
      buildMovePlan({
        ...original,
        items: [
          { ...story, iteration: original.destination },
          task(2, "Closed"),
        ],
        pendingIds: [2],
      }),
    ),
  ).toEqual([]);
});
it("requires a new move when a successfully moved parent has since changed destination", () => {
  expect(() => buildMovePlan({ ...input(), pendingIds: [2] })).toThrow(
    /Start a new move/,
  );
});
