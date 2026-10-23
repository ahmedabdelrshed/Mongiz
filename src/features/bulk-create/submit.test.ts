import { describe, it, expect, vi } from "vitest";
import { submitBatch } from "./submit";
import { defaultTasks, emptyDraft, newTask, type Results } from "./model";
import { demoMetadata, demoRepository } from "../../shared/api/demo";
import { ApiError } from "../../shared/api/azure";
import type { Repository, WorkItem } from "../../shared/api/types";
function batch() {
  const d = emptyDraft();
  d.epicId = "100";
  d.featureId = "120";
  d.assignee = "ahmed@example.com";
  d.destination = "current";
  d.stories[0].title = "Story";
  d.stories[0].tasks = [{ ...newTask(), title: "Task", hours: 3 }];
  return d;
}
const item = (id: number): WorkItem => ({
  id,
  rev: 1,
  title: "Item",
  type: "Task",
  state: "New",
  assignedTo: "",
  iteration: "OMS",
});
function repo() {
  return {
    ...demoRepository,
    findByMarker: vi.fn(async () => undefined),
    create: vi.fn(async () => item(1001)),
  } as Repository & {
    create: ReturnType<typeof vi.fn>;
    findByMarker: ReturnType<typeof vi.fn>;
  };
}
describe("recoverable Azure submission", () => {
  it("submits shared titles and individual overrides as displayed", async () => {
    const r = repo(),
      d = batch();
    d.taskTitles = { frontendImplementation: "Build shared frontend" };
    const inherited = defaultTasks()[0];
    d.stories[0].tasks = [
      inherited,
      {
        ...inherited,
        id: "override",
        title: "Custom frontend",
        inheritTitle: false,
      },
    ];
    await submitBatch(d, demoMetadata, r, {}, () => {});
    expect(r.create.mock.calls[1][1]).toContainEqual({
      op: "add",
      path: "/fields/System.Title",
      value: "Build shared frontend",
    });
    expect(r.create.mock.calls[2][1]).toContainEqual({
      op: "add",
      path: "/fields/System.Title",
      value: "Custom frontend",
    });
  });
  it("creates stories before tasks, using the returned story ID as parent", async () => {
    const r = repo();
    r.create
      .mockResolvedValueOnce(item(3000))
      .mockResolvedValueOnce(item(3001));
    const d = batch(),
      updates: Results[] = [];
    const result = await submitBatch(d, demoMetadata, r, {}, (x) =>
      updates.push(x),
    );
    expect(r.create).toHaveBeenCalledTimes(2);
    const storyPatch = r.create.mock.calls[0][1];
    expect(
      storyPatch.some(
        (p: any) =>
          p.path === "/fields/System.Tags" || p.path.includes("Scheduling"),
      ),
    ).toBe(false);
    const patch = r.create.mock.calls[1][1];
    expect(
      patch.some(
        (p: any) =>
          p.path === "/fields/System.Tags" ||
          p.path === "/fields/Microsoft.VSTS.Scheduling.RemainingWork",
      ),
    ).toBe(false);
    expect(
      patch.find((x: any) => x.path === "/relations/-").value.url,
    ).toContain("/3000");
    expect(
      patch.find(
        (x: any) =>
          x.path === "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate",
      ).value,
    ).toBe(3);
    expect(result[d.stories[0].tasks[0].id].azureId).toBe(3001);
    expect(r.findByMarker).not.toHaveBeenCalled();
    expect(updates[0][d.stories[0].id].status).toBe("uncertain");
  });
  it("retries only a failed task and never duplicates a successful story", async () => {
    const r = repo(),
      d = batch();
    r.create
      .mockResolvedValueOnce(item(3000))
      .mockRejectedValueOnce(new ApiError("Invalid field", 400));
    const first = await submitBatch(d, demoMetadata, r, {}, () => {});
    expect(first[d.stories[0].id].status).toBe("success");
    expect(first[d.stories[0].tasks[0].id].status).toBe("failed");
    r.create.mockResolvedValueOnce(item(3001));
    await submitBatch(d, demoMetadata, r, first, () => {});
    expect(r.create).toHaveBeenCalledTimes(3);
    expect(r.create.mock.calls[2][0]).toBe("Task");
  });
  it("does not create tasks when their parent story fails", async () => {
    const r = repo();
    r.create.mockRejectedValueOnce(new ApiError("Denied", 403));
    const d = batch();
    await submitBatch(d, demoMetadata, r, {}, () => {});
    expect(r.create).toHaveBeenCalledTimes(1);
  });
  it("reconciles an uncertain item using its marker without resending the POST", async () => {
    const r = repo(),
      d = batch();
    d.stories[0].tasks = [];
    r.findByMarker.mockResolvedValueOnce(item(3333));
    const result = await submitBatch(
      d,
      demoMetadata,
      r,
      { [d.stories[0].id]: { status: "uncertain" } },
      () => {},
    );
    expect(r.create).not.toHaveBeenCalled();
    expect(result[d.stories[0].id].azureId).toBe(3333);
  });
  it("keeps an unresolved network failure uncertain and blocks blind retries", async () => {
    const r = repo(),
      d = batch();
    r.create.mockRejectedValueOnce(new ApiError("Network", 0));
    const first = await submitBatch(d, demoMetadata, r, {}, () => {});
    expect(first[d.stories[0].id].status).toBe("uncertain");
    await submitBatch(d, demoMetadata, r, first, () => {});
    expect(r.create).toHaveBeenCalledTimes(1);
  });
  it("stops before creating if progress cannot be stored", async () => {
    const r = repo();
    await expect(
      submitBatch(batch(), demoMetadata, r, {}, () => {
        throw new Error("Storage full");
      }),
    ).rejects.toThrow("Storage full");
    expect(r.create).not.toHaveBeenCalled();
  });
  it("omits hours when Original Estimate is absent even if Remaining Work exists", async () => {
    const r = repo();
    await submitBatch(
      batch(),
      {
        ...demoMetadata,
        taskFields: ["Microsoft.VSTS.Scheduling.RemainingWork"],
      },
      r,
      {},
      () => {},
    );
    expect(
      r.create.mock.calls[1][1].some((p: any) => p.path.includes("Scheduling")),
    ).toBe(false);
  });
  it("creates independent items when the same batch is submitted again using saved IDs", async () => {
    const d = batch();
    let saved: Results = {};
    const first = await submitBatch(
      d,
      demoMetadata,
      demoRepository,
      {},
      (r) => {
        saved = r;
      },
    );
    const second = await submitBatch(
      d,
      demoMetadata,
      demoRepository,
      saved,
      () => {},
    );
    expect(second).toEqual(first);
    const work = await demoRepository.listMine();
    expect(work.filter((i) => i.title === "Story")).toHaveLength(1);
    expect(work.filter((i) => i.title === "Task")).toHaveLength(1);
  });
});
it("sends optional story points using the supported process field, never task hour fields on stories", async () => {
  const d = batch();
  d.stories[0].storyPoints = 8;
  for (const field of [
    "Microsoft.VSTS.Scheduling.StoryPoints",
    "Microsoft.VSTS.Scheduling.Effort",
    "Microsoft.VSTS.Scheduling.Size",
  ]) {
    const r = repo();
    await submitBatch(
      d,
      { ...demoMetadata, storyPointField: field },
      r,
      {},
      () => {},
    );
    expect(r.create.mock.calls[0][1]).toContainEqual({
      op: "add",
      path: `/fields/${field}`,
      value: 8,
    });
    expect(
      r.create.mock.calls[1][1].some((p: any) => p.path === `/fields/${field}`),
    ).toBe(false);
  }
  const r = repo();
  await submitBatch(
    d,
    { ...demoMetadata, storyPointField: undefined },
    r,
    {},
    () => {},
  );
  expect(
    r.create.mock.calls[0][1].some((p: any) => p.path.endsWith("StoryPoints")),
  ).toBe(false);
});
