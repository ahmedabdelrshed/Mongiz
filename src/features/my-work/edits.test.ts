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
it.each(["Closed", "Done", "Completed"])(
  "stages %s only for the edited task, preserving siblings of every assignee",
  (state) => {
    const edits = stageState(tasks, {}, tasks[0], state, Object.values(fields));
    expect(Object.keys(edits)).toEqual(["1"]);
    expect(effective(tasks[0], edits)).toMatchObject({ state, completed: 0.5 });
    for (const task of tasks.slice(1))
      expect(effective(task, edits)).toMatchObject({
        state: "New",
        completed: undefined,
      });
  },
);
it("sets completed hours only on explicit status changes and retains the original revision", () => {
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
  expect(edits[1].values[fields.completed]).toBe(3);
  expect(
    stage(tasks, {}, 1, { "System.State": "Closed" }, Object.values(fields))[1]
      .values[fields.completed],
  ).toBe(0.5);
});
it("validates all numeric edits before saving and skips unsupported completed hours", () => {
  expect(() => patchValues({ [fields.estimate]: "-1" })).toThrow();
  expect(() => patchValues({ [fields.estimate]: "" })).toThrow();
  expect(patchValues({ [fields.estimate]: "0.1" })).toEqual({
    [fields.estimate]: 0.1,
  });
  expect(
    stage(tasks, {}, 1, { [fields.estimate]: "3" }, [fields.estimate])[1]
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
  expect(estimate[1].values[fields.completed]).toBe(0.5);
});
