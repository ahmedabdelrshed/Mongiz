import {
  isIterationCurrent,
  type Iteration,
  type WorkItem,
} from "../../shared/api/types";
export const DEFAULT_SPRINT_TARGET = { min: 30, max: 40 };
export type SprintTarget = typeof DEFAULT_SPRINT_TARGET;
export function isSprintTarget(value: unknown): value is SprintTarget {
  const target = value as SprintTarget | null;
  return (
    !!target &&
    Number.isFinite(target.min) &&
    Number.isFinite(target.max) &&
    target.min >= 0 &&
    target.max >= target.min &&
    target.max <= 10000
  );
}
export function owns(item: WorkItem, user: string, owner: string) {
  return (
    user === "all" ||
    item.assignedTo.trim().toLowerCase() ===
      (user === "mine" ? owner : user).trim().toLowerCase()
  );
}
export function sprintMatches(
  item: WorkItem,
  sprint: string,
  iterations: Iteration[],
  backlog: string,
) {
  if (sprint === "all") return true;
  if (sprint === "backlog") return item.iteration === backlog;
  if (sprint === "current")
    return iterations.some(
      (i) => isIterationCurrent(i) && i.path === item.iteration,
    );
  return item.iteration === sprint;
}
export function uniqueSprints(iterations: Iteration[]) {
  return [...new Map(iterations.map((i) => [i.path, i])).values()];
}
export function hourTotals(items: WorkItem[]) {
  const sum = (key: "estimate" | "completed") =>
    Math.round(
      items.reduce(
        (total, i) =>
          total +
          (typeof i[key] === "number" && Number.isFinite(i[key])
            ? Math.max(0, i[key]!)
            : 0),
        0,
      ) * 100,
    ) / 100;
  return {
    estimate: sum("estimate"),
    completed: sum("completed"),
    unestimated: items.filter((i) => i.estimate === undefined).length,
  };
}
export function monthSprints(selected: Iteration[], all: Iteration[]) {
  const months = new Set(
    selected.flatMap((i) => (i.startDate ? [i.startDate.slice(0, 7)] : [])),
  );
  if (months.size !== 1 || selected.some((i) => !i.startDate)) return undefined;
  const month = [...months][0];
  return {
    month,
    sprints: uniqueSprints(all).filter(
      (i) => i.startDate?.slice(0, 7) === month,
    ),
  };
}
