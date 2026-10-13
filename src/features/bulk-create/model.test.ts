import { describe, it, expect } from "vitest";
import {
  copyTasks,
  draftSchema,
  effectiveAssignee,
  effectiveTitle,
  defaultTasks,
  emptyDraft,
  isDraft,
  newTask,
  totals,
} from "./model";
import { resolveIteration, createPatch } from "./submit";
import { demoMetadata } from "../../shared/api/demo";
describe("bulk creation rules", () => {
  it("inherits assignee and preserves an explicit override and unassignment", () => {
    const d = emptyDraft();
    d.assignee = "Ahmed";
    const t = newTask();
    expect(effectiveAssignee(t, d)).toBe("Ahmed");
    t.assignee = "Sara";
    expect(effectiveAssignee(t, d)).toBe("Sara");
    t.assignee = "";
    expect(effectiveAssignee(t, d)).toBe("");
  });
  it("copies task data with fresh IDs and independent objects", () => {
    const source = [{ ...newTask(), title: "Test UI", hours: 2 }];
    const copy = copyTasks(source);
    expect(copy[0].id).not.toBe(source[0].id);
    copy[0].title = "Changed";
    expect(source[0].title).toBe("Test UI");
    expect(copy[0].hours).toBe(2);
  });
  it("saves incomplete drafts but rejects invalid submission and negative hours", () => {
    const d = emptyDraft();
    expect(isDraft(d)).toBe(true);
    expect(draftSchema.safeParse(d).success).toBe(false);
    d.featureId = "120";
    d.stories[0].title = "Story";
    d.stories[0].tasks = [{ ...newTask(), title: "Task", hours: -1 }];
    expect(draftSchema.safeParse(d).success).toBe(false);
  });
  it("calculates task hours across stories", () => {
    const d = emptyDraft();
    d.stories[0].tasks = [
      { ...newTask(), hours: 2 },
      { ...newTask(), hours: 0.5 },
    ];
    expect(totals(d)).toEqual({ stories: 1, tasks: 2, hours: 2.5 });
  });
  it("resolves configured backlog and current sprint paths, not labels", () => {
    const d = emptyDraft();
    expect(
      resolveIteration(d, { ...demoMetadata, backlogPath: "OMS\\Portfolio" }),
    ).toBe("OMS\\Portfolio");
    d.destination = "current";
    expect(resolveIteration(d, demoMetadata)).toBe("OMS\\Sprint 12");
    expect(() =>
      resolveIteration(d, { ...demoMetadata, iterations: [] }),
    ).toThrow("no single active sprint");
  });
  it("requires a selection when more than one active iteration exists", () => {
    const d = emptyDraft();
    d.destination = "current";
    expect(() =>
      resolveIteration(d, {
        ...demoMetadata,
        iterations: demoMetadata.iterations.map((i) => ({
          ...i,
          current: true,
          startDate: undefined,
          finishDate: undefined,
        })),
      }),
    ).toThrow();
    d.destination = "specific";
    d.iterationId = "s13";
    expect(resolveIteration(d, demoMetadata)).toBe("OMS\\Sprint 13");
  });
  it("links a child to its parent and sends the selected iteration", () => {
    const patch = createPatch(
      "  Story  ",
      "Ahmed",
      "OMS\\Sprint 12",
      "OMS",
      "https://dev.azure.com/org/_apis/wit/workItems/120",
    );
    expect(patch).toContainEqual({
      op: "add",
      path: "/fields/System.IterationPath",
      value: "OMS\\Sprint 12",
    });
    expect(patch).toContainEqual({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: "https://dev.azure.com/org/_apis/wit/workItems/120",
      },
    });
    expect(patch[0].value).toBe("Story");
  });
});

it("validates shared titles and preserves older individual title overrides", () => {
  const draft = emptyDraft();
  draft.featureId = "120";
  draft.stories[0].title = "Story";
  const task = defaultTasks()[0];
  delete task.inheritTitle;
  draft.taskTitles = { frontendImplementation: "New frontend title" };
  expect(effectiveTitle(task, draft)).toBe("New frontend title");
  task.title = "Legacy custom title";
  expect(effectiveTitle(task, draft)).toBe("Legacy custom title");
  draft.taskTitles.frontendImplementation = " ";
  expect(isDraft(draft)).toBe(true);
  expect(draftSchema.safeParse(draft).success).toBe(false);
  draft.taskTitles.frontendImplementation = "x".repeat(256);
  expect(draftSchema.safeParse(draft).success).toBe(false);
});

describe("default pasted task assignment", () => {
  it("makes nine independent default tasks per story with preset estimates", async () => {
    const { defaultTasks } = await import("./model");
    const first = defaultTasks(),
      second = defaultTasks();
    expect(first).toHaveLength(9);
    expect(first.every((t) => t.assignee === "inherit" && t.hours > 0)).toBe(
      true,
    );
    expect(
      first.map((t) => t.id).some((id) => second.some((t) => t.id === id)),
    ).toBe(false);
  });
  it("updates inherited default task owners while retaining overrides and unassignment", async () => {
    const { defaultTasks, effectiveAssignee } = await import("./model");
    const d = emptyDraft();
    d.assignee = "Ahmed";
    d.taskAssignees = { frontendImplementation: "Sara" };
    const t = defaultTasks()[0];
    expect(effectiveAssignee(t, d)).toBe("Sara");
    d.taskAssignees.frontendImplementation = "Omar";
    expect(effectiveAssignee(t, d)).toBe("Omar");
    t.assignee = "Ahmed";
    expect(effectiveAssignee(t, d)).toBe("Ahmed");
    t.assignee = "";
    expect(effectiveAssignee(t, d)).toBe("");
    t.assignee = "inherit";
    d.taskAssignees.frontendImplementation = "";
    expect(effectiveAssignee(t, d)).toBe("");
  });
  it("accepts older drafts and falls back to the story assignee", async () => {
    const { defaultTasks } = await import("./model");
    const d = emptyDraft();
    d.assignee = "Ahmed";
    expect(isDraft(d)).toBe(true);
    expect(effectiveAssignee(defaultTasks()[1], d)).toBe("Ahmed");
    d.taskAssignees = { backendImplementation: "inherit" };
    expect(effectiveAssignee(defaultTasks()[1], d)).toBe("Ahmed");
  });
});

it("shared estimates propagate while task-specific overrides and resets work", async () => {
  const { defaultTasks, effectiveHours } = await import("./model");
  const d = emptyDraft();
  const tasks = defaultTasks();
  expect(tasks[0].hours).toBe(0.5);
  expect(tasks[2].hours).toBe(0.1);
  d.taskEstimates = { frontendImplementation: 2 };
  expect(effectiveHours(tasks[0], d)).toBe(2);
  tasks[0].hours = 3;
  tasks[0].inheritEstimate = false;
  d.taskEstimates.frontendImplementation = 4;
  expect(effectiveHours(tasks[0], d)).toBe(3);
  tasks[0].inheritEstimate = true;
  expect(effectiveHours(tasks[0], d)).toBe(4);
  d.stories[0].tasks = defaultTasks();
  d.taskEstimates = {};
  expect(totals(d).hours).toBe(1.7);
});
