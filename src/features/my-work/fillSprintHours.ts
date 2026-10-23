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

// Input items already contain local edits and match every list filter.
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
}): { changes: HourAllocation[]; summaries: SprintFillSummary[] } {
  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 10000)
    throw new Error("Enter a sprint minimum between 0 and 10,000 hours.");
  const automatic = !categories.length || categories.includes("auto");
  const buckets = new Map<string, WorkItem[]>();
  for (const task of tasks) {
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
    const bucket = buckets.get(key) ?? [];
    bucket.push(task);
    buckets.set(key, bucket);
  }
  const changes = new Map<number, HourAllocation>();
  const summaries: SprintFillSummary[] = [];
  for (const bucket of buckets.values()) {
    // Work in hundredths so rounded shares add up to the rounded gap exactly.
    const before = Math.round(
      bucket.reduce((sum, task) => sum + (task.estimate ?? 0), 0) * 100,
    );
    const gap = Math.max(0, Math.round(minimum * 100) - before);
    const classified = bucket.map((task) => ({
      task,
      kind: taskHourCategory(task.title),
      supported:
        supportedFields(task).includes(fields.estimate) &&
        supportedFields(task).includes(fields.completed),
    }));
    const summary: SprintFillSummary = {
      project: bucket[0].project ?? "",
      iteration: bucket[0].iteration,
      before: before / 100,
      added: 0,
      changed: 0,
      completionOnly: 0,
      unmatched: classified.filter(({ kind }) => !kind).length,
      unsupported: classified.filter(
        ({ kind, supported }) => kind && !supported,
      ).length,
    };
    summaries.push(summary);
    if (
      !bucket[0].iteration ||
      bucket[0].iteration === backlogPath(bucket[0])
    ) {
      summary.reason = "Backlog items skipped";
      continue;
    }
    // Every estimated task contributes to the sprint total, even when its
    // category receives no added hours. Match its completed work as well.
    for (const task of bucket) {
      if (
        task.estimate !== undefined &&
        task.completed !== task.estimate &&
        supportedFields(task).includes(fields.completed)
      ) {
        changes.set(task.id, {
          item: task,
          values: { [fields.completed]: task.estimate },
        });
        summary.completionOnly++;
      }
    }
    if (!gap) {
      summary.reason = "Already at or above the minimum";
      continue;
    }
    const byStory = new Map<string, WorkItem[]>();
    for (const { task, kind, supported } of classified) {
      if (!kind || !supported) continue;
      if (!automatic && !categories.includes(kind)) continue;
      // Unparented tasks are independent rather than siblings of each other.
      const key =
        task.parentId === undefined
          ? `task:${task.id}`
          : `story:${task.parentId}`;
      const siblings = byStory.get(key) ?? [];
      siblings.push(task);
      byStory.set(key, siblings);
    }
    const eligible = [...byStory.values()]
      .flatMap((siblings) => {
        if (!automatic) return siblings;
        const priority = ["implementation", "testing", "review"] as const;
        const first = priority.find((kind) =>
          siblings.some((task) => taskHourCategory(task.title) === kind),
        );
        return siblings.filter(
          (task) => taskHourCategory(task.title) === first,
        );
      })
      .sort((a, b) => a.id - b.id);
    if (!eligible.length) {
      summary.reason = "No eligible tasks for the selected categories";
      continue;
    }
    // Only the first IDs receive a share when the gap is smaller than one
    // hundredth per task. Keep other estimates (including extra precision) intact.
    const recipients = eligible.slice(0, Math.min(gap, eligible.length));
    const recipientIds = new Set(recipients.map((item) => item.id));
    const baseCents = recipients.map((item) =>
      Math.ceil((item.estimate ?? 0) * 100 - 1e-8),
    );
    const unchanged = bucket.reduce(
      (sum, item) =>
        sum + (recipientIds.has(item.id) ? 0 : (item.estimate ?? 0)),
      0,
    );
    // Account for rounding existing estimates as well as the added hours, so
    // saved values with more than two decimals still reach the target once.
    const remainingGap = Math.max(
      0,
      Math.round(minimum * 100) -
        Math.round(
          unchanged * 100 + baseCents.reduce((sum, value) => sum + value, 0),
        ),
    );
    const share = Math.floor(remainingGap / recipients.length);
    const remainder = remainingGap % recipients.length;
    recipients.forEach((item, index) => {
      const estimate =
        (baseCents[index] + share + (index < remainder ? 1 : 0)) / 100;
      if (estimate === (item.estimate ?? 0)) return;
      if (estimate > 10000)
        throw new Error(
          `Task #${item.id} would exceed 10,000 hours. Reduce the sprint minimum.`,
        );
      if (changes.has(item.id)) summary.completionOnly--;
      changes.set(item.id, {
        item,
        values: { [fields.estimate]: estimate, [fields.completed]: estimate },
      });
      summary.changed++;
    });
    summary.added = gap / 100;
  }
  return {
    changes: [...changes.values()].sort((a, b) => a.item.id - b.item.id),
    summaries,
  };
}
