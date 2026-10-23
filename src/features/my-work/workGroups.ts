import type { WorkItem } from "../../shared/api/types";

export interface WorkGroup {
  story?: WorkItem;
  tasks: WorkItem[];
}

export function matchesWorkSearch(item: WorkItem, search: string): boolean {
  const text = search.trim().toLowerCase();
  const id = text.replace(/^#(?=\d+$)/, "");
  return (
    item.title.toLowerCase().includes(text) || String(item.id).includes(id)
  );
}

export function groupWorkItems({
  stories,
  tasks,
  search,
  matchesFilters,
  plannedIds,
}: {
  stories: WorkItem[];
  tasks: WorkItem[];
  search: string;
  matchesFilters: (item: WorkItem) => boolean;
  plannedIds?: number[];
}): WorkGroup[] {
  const storyIds = new Set(stories.map((story) => story.id));
  const planned = plannedIds && new Set(plannedIds);
  const children = new Map<number, WorkItem[]>();
  const orphanGroups: WorkGroup[] = [];
  for (const task of tasks) {
    if (!matchesFilters(task) || (planned && !planned.has(task.id))) continue;
    if (task.parentId !== undefined && storyIds.has(task.parentId)) {
      const siblings = children.get(task.parentId) ?? [];
      siblings.push(task);
      children.set(task.parentId, siblings);
    } else if (matchesWorkSearch(task, search)) {
      orphanGroups.push({ tasks: [task] });
    }
  }
  const groups: WorkGroup[] = [];
  for (const story of stories) {
    const storyMatches = matchesWorkSearch(story, search);
    const matchingTasks = (children.get(story.id) ?? []).filter(
      (task) => storyMatches || matchesWorkSearch(task, search),
    );
    if (
      matchingTasks.length ||
      (!planned && storyMatches && matchesFilters(story))
    )
      groups.push({ story, tasks: matchingTasks });
  }
  return [...groups, ...orphanGroups];
}
