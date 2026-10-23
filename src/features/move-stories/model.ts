import type {
  ProjectWorkConfig,
  Repository,
  WorkItem,
} from "../../shared/api/types";

export interface MoveGroup {
  story: WorkItem;
  moveStory: boolean;
  tasks: WorkItem[];
}
export interface MovePlan {
  project: string;
  destination: string;
  groups: MoveGroup[];
  skipped: WorkItem[];
}
export interface MoveResult {
  item: WorkItem;
  storyId: number;
  status: "moved" | "failed" | "skipped";
  message?: string;
  retryable?: boolean;
}
type Types = Pick<
  ProjectWorkConfig,
  "storyType" | "taskType" | "storyTypes" | "taskTypes"
>;

export function isStory(item: WorkItem, config: Types) {
  return (
    item.isStory ??
    (config.storyTypes ?? [config.storyType]).includes(item.type)
  );
}
export function isTask(item: WorkItem, config: Types) {
  return (
    item.isTask ?? (config.taskTypes ?? [config.taskType]).includes(item.type)
  );
}
export function filterStories(
  stories: WorkItem[],
  search: string,
  statuses: string[],
  source: string,
) {
  const term = search.trim().toLowerCase();
  return stories.filter(
    (item) =>
      (item.title.toLowerCase().includes(term) ||
        String(item.id).includes(term)) &&
      (statuses.includes("all") || statuses.includes(item.state)) &&
      (source === "all" || source === item.iteration),
  );
}
export function changedItems(plan: MovePlan) {
  return plan.groups.flatMap((group) => [
    ...(group.moveStory ? [group.story] : []),
    ...group.tasks,
  ]);
}

export function buildMovePlan({
  project,
  items,
  storyIds,
  destination,
  taskStates,
  config,
  pendingIds,
}: {
  project: string;
  items: WorkItem[];
  storyIds: number[];
  destination: string;
  taskStates: string[];
  config: Types;
  /** Retry only unfinished operations from an existing batch. */
  pendingIds?: number[];
}): MovePlan {
  if (destination !== project && !destination.startsWith(project + "\\"))
    throw new Error("Choose a destination iteration in the selected project.");
  const byId = new Map(items.map((item) => [item.id, item]));
  const childrenByParent = new Map<number, WorkItem[]>();
  const states = new Set(taskStates);
  const pending = pendingIds ? new Set(pendingIds) : undefined;
  for (const item of byId.values()) {
    if (
      item.parentId &&
      item.project === project &&
      isTask(item, config) &&
      states.has(item.state) &&
      (!pending || pending.has(item.id))
    ) {
      const children = childrenByParent.get(item.parentId) ?? [];
      children.push(item);
      childrenByParent.set(item.parentId, children);
    }
  }
  const groups: MoveGroup[] = [];
  const skipped: WorkItem[] = [];
  for (const id of new Set(storyIds)) {
    const story = byId.get(id);
    if (!story || story.project !== project || !isStory(story, config))
      throw new Error(
        `Story #${id} is no longer available in the selected project. Refresh and select stories again.`,
      );
    const children = childrenByParent.get(id) ?? [];
    const moveStory =
      story.iteration !== destination && (!pending || pending.has(id));
    const tasks = children.filter((task) => task.iteration !== destination);
    if (tasks.length && !moveStory && story.iteration !== destination)
      throw new Error(
        `Story #${id} has moved away from the destination. Start a new move for this story.`,
      );
    skipped.push(...children.filter((task) => task.iteration === destination));
    if (story.iteration === destination && (!pending || pending.has(id)))
      skipped.push(story);
    if (moveStory || tasks.length) groups.push({ story, moveStory, tasks });
  }
  return { project, destination, groups, skipped };
}

export async function executeMove(
  plan: MovePlan,
  repo: Pick<Repository, "update">,
  onResult: (result: MoveResult) => void,
  onUpdated: (item: WorkItem) => void,
): Promise<MoveResult[]> {
  const results: MoveResult[] = [];
  const report = (result: MoveResult) => {
    results.push(result);
    onResult(result);
  };
  for (const item of plan.skipped)
    report({
      item,
      storyId: item.id,
      status: "skipped",
      message: "Already in destination.",
    });
  const move = async (item: WorkItem, storyId: number) => {
    let updated: WorkItem;
    try {
      const response = await repo.update(item, {
        "System.IterationPath": plan.destination,
      });
      updated = {
        ...item,
        ...response,
        project: response.project ?? item.project,
        parentId: response.parentId ?? item.parentId,
        storyPointField: response.storyPointField ?? item.storyPointField,
        isStory: item.isStory,
        isTask: item.isTask,
      };
    } catch (error) {
      report({
        item,
        storyId,
        status: "failed",
        retryable: true,
        message: error instanceof Error ? error.message : "Move failed.",
      });
      return false;
    }
    onUpdated(updated);
    report({ item: updated, storyId, status: "moved" });
    return true;
  };
  for (const group of plan.groups) {
    if (group.moveStory && !(await move(group.story, group.story.id))) {
      for (const task of group.tasks)
        report({
          item: task,
          storyId: group.story.id,
          status: "skipped",
          retryable: true,
          message: "Story move failed; task was not changed.",
        });
      continue;
    }
    for (const task of group.tasks) await move(task, group.story.id);
  }
  return results;
}
