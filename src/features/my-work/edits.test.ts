import { expect, it } from "vitest";
import { fields, type WorkItem } from "../../shared/api/types";
import { effective, patchValues, stage, stageState } from "./edits";
const tasks: WorkItem[] = [1, 2, 3, 4].map((id) => ({
  id,
  rev: 1,
  title: `Task ${id}`,
  type: "Task",
  state: "New",
  assignedTo: id === 2 ? "sara" : "ahmed",
  iteration: "OMS",
  parentId: id === 3 ? 200 : 100,
  estimate: 0.5,
}));
it("closes only the edited task, preserving siblings of every assignee", () => {
  const edits = stageState(tasks, {}, tasks[0], "Closed", Object.values(fields));
  expect(Object.keys(edits)).toEqual(["1"]);
  expect(effective(tasks[0], edits)).toMatchObject({
    state: "Closed",
    completed: 0.5,
  });
  for (const task of tasks.slice(1))
    expect(effective(task, edits)).toMatchObject({
      state: "New",
      completed: undefined,
    });
});
it.each(["New", "Active", "Resolved", "Removed", "Done", "Completed"])(
  "preserves unset and existing completed hours when changing status to %s",
  (state) => {
    for (const completed of [undefined, 0.25]) {
      const task = { ...tasks[0], state: "Closed", completed };
      const edits = stageState([task], {}, task, state, Object.values(fields));
      expect(edits[task.id].values).toEqual({ "System.State": state });
      expect(effective(task, edits).completed).toBe(completed);
    }
  },
);
it("uses the draft estimate only on closure and retains the original revision", () => {
  let edits = stage(
    tasks,
    {},
    1,
    { [fields.estimate]: "3" },
    Object.values(fields),
  );
  expect(edits[1].values[fields.completed]).toBeUndefined();
  edits = stage(
    tasks.map((t) => ({ ...t, rev: 2 })),
    edits,
    1,
    { "System.State": "Active" },
    Object.values(fields),
  );
  expect(edits[1].rev).toBe(1);
  expect(edits[1].values[fields.completed]).toBeUndefined();
  edits = stageState(tasks, edits, tasks[0], "Closed", Object.values(fields));
  expect(edits[1].rev).toBe(1);
  expect(edits[1].values[fields.completed]).toBe(3);
  expect(
    stage(tasks, {}, 1, { "System.State": "Closed" }, Object.values(fields))[1]
      .values[fields.completed],
  ).toBe(0.5);
});
it("preserves completed hours when Closed is reapplied to saved or draft state", () => {
  const task = { ...tasks[0], state: "Closed", completed: 0.25 };
  expect(stageState([task], {}, task, "Closed", Object.values(fields))).toEqual(
    {},
  );
  const estimate = stage(
    [task],
    {},
    task.id,
    { "System.State": "Closed", [fields.estimate]: 3 },
    Object.values(fields),
  );
  expect(estimate[task.id].values).toEqual({ [fields.estimate]: 3 });
  const closed = stageState(tasks, {}, tasks[0], "Closed", Object.values(fields));
  const manual = stage(
    tasks,
    closed,
    1,
    { [fields.completed]: 0.25 },
    Object.values(fields),
  );
  expect(
    stageState(tasks, manual, tasks[0], "Closed", Object.values(fields)),
  ).toEqual(manual);
});
it("validates all numeric edits before saving and skips unsupported completed hours", () => {
  expect(() => patchValues({ [fields.estimate]: "-1" })).toThrow();
  expect(() => patchValues({ [fields.estimate]: "" })).toThrow();
  expect(patchValues({ [fields.estimate]: "0.1" })).toEqual({
    [fields.estimate]: 0.1,
  });
  expect(
    stage(tasks, {}, 1, { "System.State": "Closed" }, [fields.estimate])[1]
      .values[fields.completed],
  ).toBeUndefined();
});
it("validates points and keeps story state changes separate from sibling stories", () => {
  const pointField = "Microsoft.VSTS.Scheduling.Effort";
  const stories = tasks.slice(0, 2).map((t) => ({
    ...t,
    type: "Product Backlog Item",
    isStory: true,
    parentId: 500,
    estimate: undefined,
    storyPointField: pointField,
    storyPoints: 3,
  }));
  const edits = stageState(stories, {}, stories[0], "Closed", []);
  expect(Object.keys(edits)).toEqual(["1"]);
  const withPoints = stage(stories, edits, 1, { [pointField]: "8" }, []);
  expect(effective(stories[0], withPoints).storyPoints).toBe(8);
  expect(patchValues(withPoints[1].values)[pointField]).toBe(8);
  expect(() => patchValues({ [pointField]: "" })).toThrow();
  expect(() => patchValues({ [pointField]: -1 })).toThrow();
});
it("preserves 0.1h and missing estimates in bulk, while allowing zero and other estimates", async () => {
  const { canBulkEstimate, BULK_ESTIMATE_EXCLUDED_HOURS } =
    await import("./edits");
  expect(BULK_ESTIMATE_EXCLUDED_HOURS).toBe(0.1);
  expect(canBulkEstimate({ ...tasks[0], estimate: 0.1 })).toBe(false);
  expect(canBulkEstimate({ ...tasks[0], estimate: undefined })).toBe(false);
  expect(canBulkEstimate({ ...tasks[0], estimate: 0 })).toBe(true);
  expect(canBulkEstimate(tasks[0])).toBe(true);
});

it("loading, assignment and estimate edits do not generate completed work edits even after an earlier state change", () => {
  expect(stage(tasks, {}, 1, {}, Object.values(fields))).toEqual({});
  const assigned = stage(
    tasks,
    {},
    1,
    { "System.AssignedTo": "sara" },
    Object.values(fields),
  );
  expect(assigned[1].values[fields.completed]).toBeUndefined();
  const active = stageState(
    tasks,
    {},
    tasks[0],
    "Active",
    Object.values(fields),
  );
  const estimate = stage(
    tasks,
    active,
    1,
    { [fields.estimate]: 4 },
    Object.values(fields),
  );
  expect(estimate[1].values[fields.completed]).toBeUndefined();
  const closed = stageState(
    tasks,
    estimate,
    tasks[0],
    "Closed",
    Object.values(fields),
  );
  const changedEstimate = stage(
    tasks,
    closed,
    1,
    { [fields.estimate]: 6 },
    Object.values(fields),
  );
  expect(changedEstimate[1].values[fields.completed]).toBe(4);
});
