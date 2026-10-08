import type { Metadata, Patch, Repository, WorkItem } from "./types";
import { fields } from "./types";
import { readStored, writeStored } from "../storage/storage";
const key = "taskflow:v1:demo:workitems";
const initial: WorkItem[] = [
  {
    id: 2481,
    rev: 1,
    title: "Search device history by serial number",
    type: "User Story",
    state: "Active",
    assignedTo: "ahmed@example.com",
    iteration: "OMS\\Sprint 12",
    parentId: 120,
  },
  {
    id: 2482,
    rev: 1,
    title: "Analyze requirements",
    type: "Task",
    state: "Closed",
    assignedTo: "ahmed@example.com",
    iteration: "OMS\\Sprint 12",
    parentId: 2481,
    estimate: 2,
    remaining: 0,
    completed: 2,
  },
  {
    id: 2483,
    rev: 1,
    title: "Build search form",
    type: "Task",
    state: "Active",
    assignedTo: "ahmed@example.com",
    iteration: "OMS\\Sprint 12",
    parentId: 2481,
    estimate: 3,
    remaining: 2,
  },
  {
    id: 2484,
    rev: 1,
    title: "Integrate traceability API",
    type: "Task",
    state: "New",
    assignedTo: "ahmed@example.com",
    iteration: "OMS\\Sprint 12",
    parentId: 2481,
    estimate: 2,
    remaining: 2,
  },
];
export const demoMetadata: Metadata = {
  projects: [{ id: "OMS", name: "OMS" }],
  teams: [{ id: "OMS Team", name: "OMS Team" }],
  people: [
    { id: "ahmed", name: "Ahmed", identity: "ahmed@example.com" },
    { id: "sara", name: "Sara", identity: "sara@example.com" },
    { id: "omar", name: "Omar", identity: "omar@example.com" },
  ],
  epics: [
    { id: "100", name: "Manufacturing Operations" },
    { id: "101", name: "Platform Improvements" },
  ],
  features: [
    { id: "120", name: "Serial Traceability", parentId: "100" },
    { id: "121", name: "Work Order Dashboard", parentId: "100" },
    { id: "122", name: "Authentication", parentId: "101" },
  ],
  iterations: [
    {
      id: "s12",
      name: "Sprint 12",
      path: "OMS\\Sprint 12",
      current: true,
      startDate: "2026-10-01",
      finishDate: "2026-10-14",
      project: "OMS",
    },
    {
      id: "s13",
      name: "Sprint 13",
      path: "OMS\\Sprint 13",
      startDate: "2026-10-15",
      finishDate: "2026-10-28",
      project: "OMS",
    },
  ],
  backlogPath: "OMS",
  areaPath: "OMS",
  storyPointField: "Microsoft.VSTS.Scheduling.StoryPoints",
  storyStates: ["New", "Active", "Resolved", "Closed"],
  storyType: "User Story",
  taskType: "Task",
  taskFields: Object.values(fields),
  taskStates: ["New", "Active", "Closed"],
  warnings: [],
};
const load = () =>
  readStored(
    key,
    initial,
    (v): v is WorkItem[] =>
      Array.isArray(v) &&
      v.every(
        (i) => i && typeof i.id === "number" && typeof i.title === "string",
      ),
  );
function changed(item: WorkItem, values: Record<string, unknown>): WorkItem {
  const x = { ...item };
  for (const [name, val] of Object.entries(values)) {
    switch (name) {
      case "System.Title":
        x.title = String(val);
        break;
      case "System.State":
        x.state = String(val);
        break;
      case "System.AssignedTo":
        x.assignedTo = String(val);
        break;
      case "System.IterationPath":
        x.iteration = String(val);
        break;
      case "System.Tags":
        x.tags = String(val);
        break;
      case "Microsoft.VSTS.Scheduling.StoryPoints":
        x.storyPoints = Number(val);
        x.storyPointField = name;
        break;
      case fields.estimate:
        x.estimate = Number(val);
        break;
      case fields.remaining:
        x.remaining = Number(val);
        break;
      case fields.completed:
        x.completed = Number(val);
        break;
    }
  }
  return x;
}
export const demoRepository: Repository = {
  projects: async () => demoMetadata.projects,
  teams: async () => demoMetadata.teams,
  metadata: async () => demoMetadata,
  workMetadata: async () => demoMetadata,
  defaultTeam: async () => demoMetadata.teams[0],
  listMine: async (assignee, _metadata, onProgress) => {
    const items = load();
    const assigned = items.filter(
      (i) =>
        assignee === "all" ||
        i.assignedTo.toLowerCase() ===
          (assignee ?? "ahmed@example.com").toLowerCase(),
    );
    const storyIds = new Set(
      assigned
        .filter((i) => i.type === demoMetadata.storyType)
        .map((i) => i.id),
    );
    assigned
      .filter((i) => i.type === demoMetadata.taskType && i.parentId)
      .forEach((i) => storyIds.add(i.parentId!));
    const result = items.filter(
      (i) =>
        assigned.some((a) => a.id === i.id) ||
        storyIds.has(i.id) ||
        (i.type === demoMetadata.taskType &&
          i.parentId &&
          storyIds.has(i.parentId)),
    );
    onProgress?.({
      project: demoMetadata.projects[0],
      projectIndex: 0,
      totalProjects: 1,
      completedProjects: 1,
      phase: "complete",
      totalItems: result.length,
      loadedItems: result.length,
      items: result,
    });
    return result;
  },
  parentUrl: (id) => `https://dev.azure.com/demo/_apis/wit/workItems/${id}`,
  findByMarker: async (marker) =>
    load().find((i) =>
      i.tags
        ?.split(";")
        .map((s) => s.trim())
        .includes(marker),
    ),
  create: async (type: string, patch: Patch) => {
    const items = load();
    let item: WorkItem = {
      id: Math.max(2500, ...items.map((i) => i.id)) + 1,
      rev: 1,
      title: "",
      type,
      state: "New",
      assignedTo: "",
      iteration: "OMS",
    };
    for (const op of patch) {
      if (op.path.startsWith("/fields/"))
        item = changed(item, { [op.path.slice(8)]: op.value });
      if (op.path === "/relations/-") {
        const value = op.value as { url: string };
        item.parentId = Number(value.url.split("/").pop());
      }
    }
    items.push(item);
    if (!writeStored(key, items))
      throw new Error("Cannot save demo work items in browser storage.");
    return item;
  },
  update: async (item, values) => {
    const items = load(),
      current = items.find((i) => i.id === item.id);
    if (!current || current.rev !== item.rev)
      throw new Error("This item changed. Refresh before saving.");
    const updated = { ...changed(current, values), rev: current.rev + 1 };
    if (
      !writeStored(
        key,
        items.map((i) => (i.id === item.id ? updated : i)),
      )
    )
      throw new Error("Cannot save demo work items.");
    return updated;
  },
};
