import { ApiError } from "../../shared/api/azure";
import {
  fields,
  isIterationCurrent,
  type Metadata,
  type Patch,
  type Repository,
} from "../../shared/api/types";
import {
  draftSchema,
  effectiveAssignee,
  effectiveHours,
  type Draft,
  type Results,
} from "./model";
export function resolveIteration(draft: Draft, meta: Metadata) {
  if (draft.destination === "backlog") return meta.backlogPath;
  if (draft.destination === "current") {
    const current = meta.iterations.filter((iteration) =>
      isIterationCurrent(iteration),
    );
    if (current.length !== 1)
      throw new Error(
        "Choose a specific sprint or Backlog: the team has no single active sprint.",
      );
    return current[0].path;
  }
  const selected = meta.iterations.find((i) => i.id === draft.iterationId);
  if (!selected) throw new Error("Choose a sprint.");
  return selected.path;
}
const html = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br>");
export function createPatch(
  title: string,
  assignee: string,
  iteration: string,
  area: string,
  parentUrl: string,
): Patch {
  return [
    { op: "add", path: "/fields/System.Title", value: title.trim() },
    { op: "add", path: "/fields/System.IterationPath", value: iteration },
    { op: "add", path: "/fields/System.AreaPath", value: area },
    ...(assignee
      ? [
          {
            op: "add" as const,
            path: "/fields/System.AssignedTo",
            value: assignee,
          },
        ]
      : []),
    {
      op: "add",
      path: "/relations/-",
      value: { rel: "System.LinkTypes.Hierarchy-Reverse", url: parentUrl },
    },
  ];
}
/** Persist intent before POST, IDs immediately afterwards. Uncertain POSTs are never blindly retried. */
export async function submitBatch(
  draft: Draft,
  meta: Metadata,
  repo: Repository,
  previous: Results,
  onChange: (results: Results) => void,
): Promise<Results> {
  draftSchema.parse(draft);
  const iteration = resolveIteration(draft, meta);
  if (
    !meta.features.some(
      (f) => f.id === draft.featureId && f.parentId === draft.epicId,
    )
  )
    throw new Error("Select a feature belonging to the selected Epic.");
  let results: Results = { ...previous };
  const save = (id: string, value: Results[string]) => {
    results = { ...results, [id]: value };
    onChange(results);
  };
  async function create(
    id: string,
    type: string,
    patch: Patch,
  ): Promise<number | undefined> {
    if (results[id]?.status === "success") return results[id].azureId;
    const marker = `tf-${draft.batchId}-${id}`;
    // New items have no tags. Query only when resuming an uncertain result
    // to preserve recovery for batches created by older versions.
    if (results[id]?.status === "uncertain")
      try {
        const existing = await repo.findByMarker(marker);
        if (existing) {
          save(id, { status: "success", azureId: existing.id });
          return existing.id;
        }
      } catch (e) {
        save(id, {
          status: results[id]?.status === "uncertain" ? "uncertain" : "failed",
          message: `Could not reconcile: ${e instanceof Error ? e.message : "Unknown error"}`,
        });
        return;
      }
    if (results[id]?.status === "uncertain") {
      save(id, {
        status: "uncertain",
        message:
          "Creation was interrupted. New items have no recovery tag. Check Azure manually before marking this item safe to retry.",
      });
      return;
    }
    save(id, { status: "uncertain", message: "Creating…" });
    try {
      const item = await repo.create(type, patch);
      save(id, { status: "success", azureId: item.id });
      return item.id;
    } catch (e) {
      const definite =
        e instanceof ApiError && e.status >= 400 && e.status < 500;
      save(id, {
        status: definite ? "failed" : "uncertain",
        message: e instanceof Error ? e.message : "Creation failed",
      });
      return;
    }
  }
  for (const story of draft.stories) {
    const patch = createPatch(
      story.title,
      draft.assignee,
      iteration,
      meta.areaPath,
      repo.parentUrl(Number(draft.featureId)),
    );
    if (story.storyPoints !== undefined && meta.storyPointField)
      patch.push({
        op: "add",
        path: `/fields/${meta.storyPointField}`,
        value: story.storyPoints,
      });
    if (story.criteria.trim())
      patch.push({
        op: "add",
        path: "/fields/System.Description",
        value: html(story.criteria),
      });
    const storyId = await create(story.id, meta.storyType, patch);
    if (!storyId) continue;
    for (const task of story.tasks) {
      const taskPatch = createPatch(
        task.title,
        effectiveAssignee(task, draft),
        iteration,
        meta.areaPath,
        repo.parentUrl(storyId),
      );
      for (const field of [fields.estimate])
        if (meta.taskFields.includes(field))
          taskPatch.push({
            op: "add",
            path: `/fields/${field}`,
            value: effectiveHours(task, draft),
          });
      await create(task.id, meta.taskType, taskPatch);
    }
  }
  return results;
}
