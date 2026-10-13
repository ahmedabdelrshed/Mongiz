import { z } from "zod";
export const defaultTaskDefinitions = [
  {
    key: "frontendImplementation",
    label: "Frontend implementation",
    title: "Implement frontend requirements",
    hours: 0.5,
  },
  {
    key: "backendImplementation",
    label: "Backend implementation",
    title: "Implement backend requirements",
    hours: 0.5,
  },
  {
    key: "frontendSource",
    label: "Frontend source code",
    title: "Link frontend source code",
    hours: 0.1,
  },
  {
    key: "backendSource",
    label: "Backend source code",
    title: "Link backend source code",
    hours: 0.1,
  },
  {
    key: "frontendStaticAnalysis",
    label: "Frontend static analysis",
    title: "Frontend static code analysis",
    hours: 0.1,
  },
  {
    key: "backendStaticAnalysis",
    label: "Backend static analysis",
    title: "Backend static code analysis",
    hours: 0.1,
  },
  {
    key: "unitTesting",
    label: "Unit testing",
    title: "Unit testing",
    hours: 0.1,
  },
  {
    key: "frontendCodeReview",
    label: "Frontend code review",
    title: "Frontend code review",
    hours: 0.1,
  },
  {
    key: "backendCodeReview",
    label: "Backend code review",
    title: "Backend code review",
    hours: 0.1,
  },
] as const;
export type DefaultTaskKey = (typeof defaultTaskDefinitions)[number]["key"];
const defaultTaskKeySchema = z.enum([
  "frontendImplementation",
  "backendImplementation",
  "frontendSource",
  "backendSource",
  "frontendStaticAnalysis",
  "backendStaticAnalysis",
  "unitTesting",
  "frontendCodeReview",
  "backendCodeReview",
]);
export const taskSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1, "Enter a task title").max(255),
  assignee: z.string(),
  defaultTaskKey: defaultTaskKeySchema.optional(),
  inheritTitle: z.boolean().optional(),
  inheritEstimate: z.boolean().optional(),
  hours: z.number().finite().min(0).max(10000),
});
export const storySchema = z.object({
  storyPoints: z.number().finite().min(0).max(10000).optional(),
  id: z.string(),
  title: z.string().trim().min(1, "Enter a story title").max(255),
  criteria: z.string().max(10000),
  tasks: z.array(taskSchema),
});
export const draftSchema = z.object({
  version: z.literal(1),
  batchId: z.string(),
  epicId: z.string(),
  featureId: z.string().min(1, "Select a parent feature"),
  assignee: z.string(),
  taskAssignees: z.partialRecord(defaultTaskKeySchema, z.string()).optional(),
  taskTitles: z
    .partialRecord(
      defaultTaskKeySchema,
      z.string().trim().min(1, "Enter a shared task title").max(255),
    )
    .optional(),
  taskEstimates: z
    .partialRecord(defaultTaskKeySchema, z.number().finite().min(0).max(10000))
    .optional(),
  destination: z.enum(["current", "backlog", "specific"]),
  iterationId: z.string(),
  stories: z.array(storySchema).min(1, "Add at least one story"),
});
export type TaskDraft = z.infer<typeof taskSchema>;
export type StoryDraft = z.infer<typeof storySchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Result = {
  status: "success" | "failed" | "uncertain";
  azureId?: number;
  message?: string;
};
export type Results = Record<string, Result>;
export const newTask = (): TaskDraft => ({
  id: crypto.randomUUID(),
  title: "",
  assignee: "inherit",
  hours: 1,
});
export const newStory = (): StoryDraft => ({
  id: crypto.randomUUID(),
  title: "",
  criteria: "",
  tasks: [],
});
export const emptyDraft = (): Draft => ({
  version: 1,
  batchId: crypto.randomUUID(),
  epicId: "",
  featureId: "",
  assignee: "",
  destination: "backlog",
  iterationId: "",
  stories: [newStory()],
});
export function copyTasks(source: TaskDraft[]): TaskDraft[] {
  return source.map((t) => ({ ...t, id: crypto.randomUUID() }));
}
export function totals(draft: Draft) {
  return {
    stories: draft.stories.length,
    tasks: draft.stories.reduce((n, s) => n + s.tasks.length, 0),
    hours:
      Math.round(
        draft.stories.reduce(
          (n, s) =>
            n +
            s.tasks.reduce(
              (a, t) =>
                a +
                (Number.isFinite(effectiveHours(t, draft))
                  ? effectiveHours(t, draft)
                  : 0),
              0,
            ),
          0,
        ) * 10000,
      ) / 10000,
  };
}
export function effectiveAssignee(
  task: TaskDraft,
  draft: Pick<Draft, "assignee" | "taskAssignees">,
) {
  if (task.assignee !== "inherit") return task.assignee;
  const shared = task.defaultTaskKey
    ? draft.taskAssignees?.[task.defaultTaskKey]
    : undefined;
  return shared === undefined || shared === "inherit" ? draft.assignee : shared;
}
export function defaultTasks(): TaskDraft[] {
  return defaultTaskDefinitions.map((t) => ({
    ...newTask(),
    title: t.title,
    defaultTaskKey: t.key,
    hours: t.hours,
    inheritEstimate: true,
    inheritTitle: true,
  }));
}
export function effectiveTitle(
  task: TaskDraft,
  draft: Pick<Draft, "taskTitles">,
): string {
  const definition = defaultTaskDefinitions.find(
    (t) => t.key === task.defaultTaskKey,
  );
  // Older drafts inherit unchanged defaults while keeping customized titles.
  if (
    definition &&
    (task.inheritTitle === true ||
      (task.inheritTitle === undefined && task.title === definition.title))
  )
    return draft.taskTitles?.[definition.key] ?? definition.title;
  return task.title;
}
export function effectiveHours(
  task: TaskDraft,
  draft: Pick<Draft, "taskEstimates">,
): number {
  if (task.defaultTaskKey && task.inheritEstimate === true)
    return (
      draft.taskEstimates?.[task.defaultTaskKey] ??
      defaultTaskDefinitions.find((t) => t.key === task.defaultTaskKey)!.hours
    );
  return task.hours;
}
export function validateDraft(value: unknown): value is Draft {
  return draftSchema.safeParse(value).success;
}
// Incomplete drafts can be saved; strict schema validation happens before submission.
export function isDraft(value: unknown): value is Draft {
  const r = draftSchema
    .extend({
      featureId: z.string(),
      taskTitles: z.partialRecord(defaultTaskKeySchema, z.string()).optional(),
      stories: z.array(
        storySchema.extend({
          title: z.string(),
          tasks: z.array(taskSchema.extend({ title: z.string() })),
        }),
      ),
    })
    .safeParse(value);
  return r.success;
}

export function isResults(value: unknown): value is Results {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (r) =>
        r &&
        ["success", "failed", "uncertain"].includes(r.status) &&
        (r.status !== "success" || Number.isInteger(r.azureId)),
    )
  );
}
