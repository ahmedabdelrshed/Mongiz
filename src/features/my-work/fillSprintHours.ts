import { fields, type WorkItem } from "../../shared/api/types";

export const hourCategories = [
  { value: "auto", label: "Auto" },
  { value: "implementation", label: "Implementation" },
  { value: "testing", label: "Testing" },
  { value: "review", label: "Code review" },
] as const;
export type HourCategory = (typeof hourCategories)[number]["value"];
type TaskCategory = Exclude<HourCategory, "auto">;

export function taskHourCategory(title: string): TaskCategory | undefined {
  const normalized = title.toLowerCase().replace(/[-_]+/g, " ");
  if (/\bcode\s*review\b/.test(normalized)) return "review";
  if (/\b(test|tests|testing)\b/.test(normalized)) return "testing";
  if (/\b(implement|implements|implementing|implementation)\b/.test(normalized))
    return "implementation";
}

export interface HourAllocation {
  item: WorkItem;
  values: Record<string, number>;
}
export interface SprintFillSummary {
  project: string;
  iteration: string;
  before: number;
  added: number;
  changed: number;
  completionOnly: number;
  unmatched: number;
  unsupported: number;
  reason?: string;
}
export interface HourFillTotal {
  target: number;
  before: number;
  after: number;
  skippedBacklog: number;
  reason?: string;
}

// Input items already contain local edits and match the chosen task scope.
export function fillSprintHours({
  tasks,
  minimum,
  categories,
  supportedFields,
  backlogPath,
}: {
  tasks: WorkItem[];
  minimum: number;
  categories: readonly HourCategory[];
  supportedFields: (item: WorkItem) => string[];
  backlogPath: (item: WorkItem) => string;
}): {
  changes: HourAllocation[];
  summaries: SprintFillSummary[];
  total: HourFillTotal;
} {
  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 10000)
    throw new Error("Enter a combined target between 0 and 10,000 hours.");
  const automatic = !categories.length || categories.includes("auto");
  const classified = tasks.map((task) => {
    for (const value of [task.estimate, task.completed, task.remaining]) {
      if (
        value !== undefined &&
        (!Number.isFinite(value) || value < 0 || value > 10000)
      )
        throw new Error(
          `Task #${task.id} has invalid hours. Enter values between 0 and 10,000.`,
        );
    }
    const key = JSON.stringify([task.project ?? "", task.iteration]);
    const supported = supportedFields(task);
    return {
      task,
      key,
      kind: taskHourCategory(task.title),
      supported,
      eligible:
        supported.includes(fields.estimate) &&
        supported.includes(fields.completed),
      backlog: !task.iteration || task.iteration === backlogPath(task),
    };
  });
  const cents = (value: number) => Math.round(value * 100);
  const sumEstimates = (items: WorkItem[]) =>
    items.reduce((sum, task) => sum + (task.estimate ?? 0), 0);
  const summaries = new Map<string, SprintFillSummary>();
  for (const { task, key, kind, eligible, backlog } of classified) {
    const summary = summaries.get(key) ?? {
      project: task.project ?? "",
      iteration: task.iteration,
      before: 0,
      added: 0,
      changed: 0,
      completionOnly: 0,
      unmatched: 0,
      unsupported: 0,
    };
    summary.before += task.estimate ?? 0;
    if (!kind) summary.unmatched++;
    if (kind && !eligible) summary.unsupported++;
    if (backlog) summary.reason = "Backlog items skipped";
    summaries.set(key, summary);
  }
  for (const summary of summaries.values())
    summary.before = cents(summary.before) / 100;
  const active = classified.filter(({ backlog }) => !backlog);
  const total: HourFillTotal = {
    target: cents(minimum) / 100,
    before: cents(sumEstimates(active.map(({ task }) => task))) / 100,
    after: 0,
    skippedBacklog: tasks.length - active.length,
  };
  total.after = total.before;

  // Preserve Auto's per-story priority within each project/sprint, while
  // allocating the target only once across all of those groups.
  const byStory = new Map<string, typeof active>();
  for (const entry of active) {
    const { task, key, kind, eligible } = entry;
    if (!kind || !eligible || (!automatic && !categories.includes(kind)))
      continue;
    const storyKey = JSON.stringify([
      key,
      task.parentId === undefined
        ? `task:${task.id}`
        : `story:${task.parentId}`,
    ]);
    const siblings = byStory.get(storyKey) ?? [];
    siblings.push(entry);
    byStory.set(storyKey, siblings);
  }
  const eligible = [...byStory.values()]
    .flatMap((siblings) => {
      if (!automatic) return siblings;
      const priority = ["implementation", "testing", "review"] as const;
      const first = priority.find((kind) =>
        siblings.some((entry) => entry.kind === kind),
      );
      return siblings.filter((entry) => entry.kind === first);
    })
    .sort((a, b) => a.task.id - b.task.id);
  const eligibleIds = new Set(eligible.map(({ task }) => task.id));
  const fixed = sumEstimates(
    active
      .filter(({ task }) => !eligibleIds.has(task.id))
      .map(({ task }) => task),
  );
  const available = cents(minimum) - cents(fixed);
  if (available < 0 || !eligible.length) {
    total.reason =
      available < 0
        ? "Cannot reach the combined target: other task estimates exceed it"
        : "No eligible tasks for the selected categories";
    for (const summary of summaries.values()) summary.reason ??= total.reason;
    return { changes: [], summaries: [...summaries.values()], total };
  }

  // Replace previous estimates with equal shares. Integer hundredths keep
  // the combined total exact, with deterministic remainder assignment by ID.
  const share = Math.floor(available / eligible.length);
  const remainder = available % eligible.length;
  const estimates = new Map(
    eligible.map(({ task }, index) => [
      task.id,
      (share + (index < remainder ? 1 : 0)) / 100,
    ]),
  );
  const changes: HourAllocation[] = [];
  let after = 0;
  for (const { task, key, supported } of active) {
    const estimate = estimates.get(task.id) ?? task.estimate;
    after += estimate ?? 0;
    const values: Record<string, number> = {};
    const summary = summaries.get(key)!;
    if (estimates.has(task.id) && estimate !== task.estimate) {
      values[fields.estimate] = estimate!;
      values[fields.completed] = estimate!;
      summary.changed++;
      summary.added += estimate! - (task.estimate ?? 0);
    } else if (
      estimate !== undefined &&
      task.completed !== estimate &&
      supported.includes(fields.completed)
    ) {
      values[fields.completed] = estimate;
      summary.completionOnly++;
    }
    if (Object.keys(values).length) changes.push({ item: task, values });
  }
  total.after = cents(after) / 100;
  if (![...summaries.values()].some((summary) => summary.changed))
    total.reason = "Already at the target";
  for (const summary of summaries.values()) {
    summary.added = cents(summary.added) / 100;
    if (!summary.reason && !summary.changed && total.reason)
      summary.reason = total.reason;
  }
  return {
    changes: changes.sort((a, b) => a.item.id - b.item.id),
    summaries: [...summaries.values()],
    total,
  };
}
