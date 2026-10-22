import { expect, it } from "vitest";
import { fields, type WorkItem } from "../../shared/api/types";
import { effective, stage, type Edits } from "./edits";
import { fillSprintHours, taskHourCategory } from "./fillSprintHours";
import { hourTotals } from "./filters";

function task(
  id: number,
  title: string,
  overrides: Partial<WorkItem> = {},
): WorkItem {
  return {
    id,
    rev: 2,
    title,
    type: "Task",
    project: "OMS",
    assignedTo: "ahmed",
    state: "Closed",
    iteration: "OMS\\Sprint 1",
    parentId: 10,
    estimate: 3,
    remaining: 2,
    completed: 1,
    ...overrides,
  };
}
const options = {
  minimum: 30,
  category: "auto" as const,
  supportedFields: (_item: WorkItem) => Object.values(fields),
  backlogPath: (item: WorkItem) => item.project ?? "OMS",
};

it("adds equal shares to closed implementation tasks and explicitly matches completed work", () => {
  const tasks = [
    task(2, "Implement backend requirements"),
    task(1, "Implement frontend requirements"),
  ];
  const result = fillSprintHours({ ...options, tasks });
  expect(result.changes.map(({ item, values }) => [item.id, values])).toEqual([
    [1, { [fields.estimate]: 15, [fields.completed]: 15 }],
    [2, { [fields.estimate]: 15, [fields.completed]: 15 }],
  ]);
  expect(result.summaries[0]).toMatchObject({
    before: 6,
    added: 24,
    changed: 2,
  });
  expect(tasks[0]).toMatchObject({
    state: "Closed",
    estimate: 3,
    completed: 1,
    remaining: 2,
  });
});

it("falls back separately per story, including missing estimates and 0.1h testing/review", () => {
  const tasks = [
    task(1, "Implement frontend requirements", { estimate: undefined }),
    task(2, "Unit testing", { estimate: 0.1 }),
    task(3, "Unit testing", { parentId: 20, estimate: 0.1 }),
    task(4, "Backend code review", { parentId: 20, estimate: 0.1 }),
    task(5, "Frontend code review", { parentId: 30, estimate: 0.1 }),
    task(6, "Link source code", { estimate: 0.1 }),
  ];
  const result = fillSprintHours({ ...options, tasks, minimum: 3.5 });
  const allocated = result.changes.filter(
    ({ values }) => fields.estimate in values,
  );
  expect(allocated.map(({ item }) => item.id)).toEqual([1, 3, 5]);
  expect(allocated.map(({ values }) => values[fields.estimate])).toEqual([
    1, 1.1, 1.1,
  ]);
  expect(
    result.changes.filter(({ values }) => !(fields.estimate in values)),
  ).toEqual(
    [2, 4, 6].map((id) => ({
      item: tasks.find((item) => item.id === id),
      values: { [fields.completed]: 0.1 },
    })),
  );
  expect(result.summaries[0]).toMatchObject({ unmatched: 1, added: 3 });
});

it("recognizes category title variants and honors explicit category choices", () => {
  expect(
    [
      "IMPLEMENTATION",
      "Implement backend",
      "Unit Testing",
      "Frontend code-review",
      "Static code analysis",
    ].map(taskHourCategory),
  ).toEqual([
    "implementation",
    "implementation",
    "testing",
    "review",
    undefined,
  ]);
  const tasks = [
    task(1, "Implement frontend"),
    task(2, "Unit testing"),
    task(3, "Code review"),
  ];
  for (const [category, id] of [
    ["testing", 2],
    ["review", 3],
    ["implementation", 1],
  ] as const) {
    const result = fillSprintHours({ ...options, tasks, category });
    const allocated = result.changes.filter(
      ({ values }) => fields.estimate in values,
    );
    expect(allocated.map(({ item }) => item.id)).toEqual([id]);
    expect(allocated[0].values[fields.estimate]).toBe(24);
    expect(result.changes).toHaveLength(3);
    expect(result.summaries[0].completionOnly).toBe(2);
  }
});

it("separates projects/sprints and unparented tasks, skips backlog, and assigns rounding by ID", () => {
  const tasks = [
    task(3, "Code review", { parentId: undefined, estimate: 0 }),
    task(2, "Unit testing", { parentId: undefined, estimate: 0 }),
    task(1, "Implement frontend", { parentId: undefined, estimate: 0 }),
    task(4, "Implement backend", { iteration: "OMS\\Sprint 2", estimate: 0 }),
    task(5, "Implement backend", { project: "Other", estimate: 0 }),
    task(6, "Implement frontend", { iteration: "OMS", estimate: 0 }),
  ];
  const result = fillSprintHours({ ...options, tasks, minimum: 1 });
  expect(result.changes.map(({ values }) => values[fields.estimate])).toEqual([
    0.34, 0.33, 0.33, 1, 1,
  ]);
  expect(result.summaries).toHaveLength(4);
  expect(result.summaries[3].reason).toMatch(/Backlog/);
});

it("skips unsupported tasks with category fallback and explains unfillable or full sprints", () => {
  const tasks = [task(1, "Implement frontend"), task(2, "Unit testing")];
  const supportedFields = (item: WorkItem) =>
    item.id === 1 ? [fields.estimate] : Object.values(fields);
  const result = fillSprintHours({ ...options, tasks, supportedFields });
  expect(result.changes.map(({ item }) => item.id)).toEqual([2]);
  expect(result.summaries[0].unsupported).toBe(1);
  expect(
    fillSprintHours({ ...options, tasks, category: "review" }).summaries[0]
      .reason,
  ).toMatch(/No eligible/);
  expect(
    fillSprintHours({ ...options, tasks, minimum: 6 }).summaries[0].reason,
  ).toMatch(/Already/);
});

it("uses effective drafts, retains original revisions, and is idempotent", () => {
  const tasks = [task(1, "Implement frontend"), task(2, "Implement backend")];
  let edits: Edits = stage(
    tasks,
    {},
    1,
    { [fields.estimate]: 5 },
    Object.values(fields),
  );
  const result = fillSprintHours({
    ...options,
    tasks: tasks.map((item) => effective(item, edits)),
  });
  expect(result.summaries[0].added).toBe(22);
  for (const { item, values } of result.changes)
    edits = stage(tasks, edits, item.id, values, Object.values(fields));
  expect(edits[1].rev).toBe(2);
  expect(effective(tasks[0], edits)).toMatchObject({
    estimate: 16,
    completed: 16,
    state: "Closed",
    remaining: 2,
  });
  expect(
    fillSprintHours({
      ...options,
      tasks: tasks.map((item) => effective(item, edits)),
    }).changes,
  ).toEqual([]);
});

it("counts other estimates in the gap and matches completed work across every task category", () => {
  const tasks = [
    task(1, "Implement frontend", { estimate: 3 }),
    task(2, "Unit testing", { estimate: 2, completed: 0.5 }),
    task(3, "Code review", { estimate: 0.1, completed: undefined }),
    task(4, "Link source code", { estimate: 0.1, completed: 0 }),
    task(5, "Static analysis", { estimate: undefined, completed: 0.5 }),
  ];
  const result = fillSprintHours({ ...options, tasks });
  expect(result.changes.map(({ item, values }) => [item.id, values])).toEqual([
    [1, { [fields.estimate]: 27.8, [fields.completed]: 27.8 }],
    [2, { [fields.completed]: 2 }],
    [3, { [fields.completed]: 0.1 }],
    [4, { [fields.completed]: 0.1 }],
  ]);
  expect(result.summaries[0]).toMatchObject({
    before: 5.2,
    added: 24.8,
    changed: 1,
    completionOnly: 3,
  });
});

it("matches completion at/above target or without eligible categories while respecting field support and backlog", () => {
  const tasks = [
    task(1, "Unit testing", { estimate: 2 }),
    task(2, "Link source code", { estimate: 0, completed: 0.5 }),
    task(3, "Static analysis", { estimate: 0.1, completed: 0 }),
    task(4, "Link source code", { estimate: 1, completed: 1 }),
    task(5, "Link source code", { estimate: 2, iteration: "OMS" }),
  ];
  const supportedFields = (item: WorkItem) =>
    item.id === 3 ? [fields.estimate] : [fields.completed];
  for (const minimum of [1, 3, 30]) {
    const result = fillSprintHours({
      ...options,
      tasks,
      minimum,
      category: "implementation",
      supportedFields,
    });
    expect(result.changes.map(({ item, values }) => [item.id, values])).toEqual(
      [
        [1, { [fields.completed]: 2 }],
        [2, { [fields.completed]: 0 }],
      ],
    );
    expect(result.summaries[0].completionOnly).toBe(2);
  }
});

it("rejects invalid hours and target values before returning any changes", () => {
  for (const invalid of [-1, NaN, Infinity, 10001]) {
    expect(() =>
      fillSprintHours({ ...options, minimum: invalid, tasks: [] }),
    ).toThrow();
    for (const name of ["estimate", "completed", "remaining"] as const)
      expect(() =>
        fillSprintHours({
          ...options,
          tasks: [task(1, "Implement frontend", { [name]: invalid })],
        }),
      ).toThrow(/invalid hours/);
  }
  expect(
    fillSprintHours({
      ...options,
      tasks: [task(1, "Implement frontend", { estimate: 0 })],
      minimum: 10000,
    }).changes[0].values[fields.estimate],
  ).toBe(10000);
});

it("accounts for saved estimates with extra precision without needing a second fill", () => {
  const tasks = [1, 2, 3].map((id) =>
    task(id, "Implement frontend", { estimate: 0.333 }),
  );
  const result = fillSprintHours({ ...options, tasks, minimum: 3 });
  const filled = tasks.map((item) => ({
    ...item,
    estimate: result.changes.find((change) => change.item.id === item.id)!
      .values[fields.estimate],
  }));
  expect(filled.map((item) => item.estimate)).toEqual([1, 1, 1]);
  expect(hourTotals(filled).estimate).toBe(3);
  expect(
    fillSprintHours({ ...options, tasks: filled, minimum: 3 }).changes,
  ).toEqual([]);
  const smallGap = fillSprintHours({
    ...options,
    tasks: tasks.map((item) => ({ ...item, estimate: 1 })),
    minimum: 3.01,
  });
  expect(smallGap.changes.map((change) => change.item.id)).toEqual([1]);
  expect(smallGap.changes[0].values[fields.estimate]).toBe(1.01);
});
