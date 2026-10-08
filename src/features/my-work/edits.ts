import { fields, type WorkItem } from "../../shared/api/types";
export type Edits = Record<
  number,
  { rev: number; values: Record<string, string | number> }
>;
export const isEdits = (x: unknown): x is Edits =>
  !!x &&
  typeof x === "object" &&
  Object.values(x).every(
    (e) =>
      e &&
      typeof e.rev === "number" &&
      e.values &&
      typeof e.values === "object" &&
      Object.values(e.values).every(
        (v) => typeof v === "string" || typeof v === "number",
      ),
  );
export function effective(item: WorkItem, edits: Edits): WorkItem {
  const v = edits[item.id]?.values ?? {};
  return {
    ...item,
    title: String(v["System.Title"] ?? item.title),
    storyPoints:
      item.storyPointField && v[item.storyPointField] !== undefined
        ? Number(v[item.storyPointField])
        : item.storyPoints,
    state: String(v["System.State"] ?? item.state),
    assignedTo: String(v["System.AssignedTo"] ?? item.assignedTo),
    estimate:
      v[fields.estimate] !== undefined
        ? Number(v[fields.estimate])
        : item.estimate,
    completed:
      v[fields.completed] !== undefined
        ? Number(v[fields.completed])
        : item.completed,
  };
}
export function stage(
  items: WorkItem[],
  edits: Edits,
  id: number,
  values: Record<string, string | number>,
  supported: string[],
): Edits {
  const next = { ...edits };
  const item = items.find((x) => x.id === id);
  if (!item) return next;
  const merged = { ...(next[id]?.values ?? {}), ...values };
  const estimate = merged[fields.estimate] ?? item.estimate;
  if (
    values["System.State"] !== undefined &&
    !item.isStory &&
    supported.includes(fields.completed) &&
    estimate !== undefined &&
    estimate !== "" &&
    Number.isFinite(Number(estimate)) &&
    Number(estimate) >= 0
  )
    merged[fields.completed] = Number(estimate);
  const original: Record<string, unknown> = {
    "System.Title": item.title,
    "System.State": item.state,
    "System.AssignedTo": item.assignedTo,
    ...(item.storyPointField
      ? { [item.storyPointField]: item.storyPoints }
      : {}),
    [fields.estimate]: item.estimate,
    [fields.remaining]: item.remaining,
    [fields.completed]: item.completed,
  };
  for (const field of Object.keys(merged)) {
    const value = merged[field];
    if (
      value !== "" &&
      field.startsWith("Microsoft.VSTS.Scheduling.") &&
      Number.isFinite(Number(value))
    )
      merged[field] = Number(value);
    if (merged[field] === original[field]) delete merged[field];
  }
  if (Object.keys(merged).length)
    next[id] = { rev: next[id]?.rev ?? item.rev, values: merged };
  else delete next[id];
  return next;
}
export function stageState(
  items: WorkItem[],
  edits: Edits,
  item: WorkItem,
  state: string,
  supported: string[],
): Edits {
  const closing = ["closed", "done", "completed"].includes(state.toLowerCase());
  const siblings =
    closing && !item.isStory && item.parentId
      ? items.filter(
          (t) =>
            (t.isTask ?? t.type === item.type) && t.parentId === item.parentId,
        )
      : [item];
  return siblings.reduce(
    (next, t) => stage(items, next, t.id, { "System.State": state }, supported),
    edits,
  );
}
export function patchValues(
  values: Record<string, string | number>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (key.startsWith("Microsoft.VSTS.Scheduling.")) {
        if (
          value === "" ||
          !Number.isFinite(Number(value)) ||
          Number(value) < 0 ||
          Number(value) > 10000
        )
          throw new Error(
            "Hours / story points must be a number between 0 and 10,000. Enter 0 instead of leaving a changed field empty.",
          );
        return [key, Number(value)];
      }
      return [key, value];
    }),
  );
}

// Change this one value to alter which task estimates bulk editing preserves.
export const BULK_ESTIMATE_EXCLUDED_HOURS = 0.1;
export function canBulkEstimate(item: WorkItem): boolean {
  return (
    item.estimate !== undefined &&
    Number.isFinite(item.estimate) &&
    item.estimate !== BULK_ESTIMATE_EXCLUDED_HOURS
  );
}
