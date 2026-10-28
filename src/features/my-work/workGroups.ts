import type { WorkItem } from "../../shared/api/types";

export interface WorkGroup {
  story?: WorkItem;
  contextOnly?: boolean;
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
  includeStory = () => true,
  includeTasks = true,
}: {
  stories: WorkItem[];
  tasks: WorkItem[];
  search: string;
  matchesFilters: (item: WorkItem) => boolean;
  plannedIds?: number[];
  includeStory?: (item: WorkItem) => boolean;
  includeTasks?: boolean;
}): WorkGroup[] {
  const storyIds = new Set(stories.map((story) => story.id));
  const planned = plannedIds && new Set(plannedIds);
  const children = new Map<number, WorkItem[]>();
  const orphanGroups: WorkGroup[] = [];
  for (const task of tasks) {
    if (!includeTasks) continue;
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
    const selectedStory = !planned && includeStory(story) && storyMatches && matchesFilters(story);
    if (matchingTasks.length || selectedStory)
      groups.push({ story, tasks: matchingTasks, ...(!includeStory(story) ? { contextOnly: true } : {}) });
  }
  return [...groups, ...orphanGroups];
}
