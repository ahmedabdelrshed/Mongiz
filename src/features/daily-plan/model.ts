import { storageKey } from "../../shared/storage/storage";
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const planKey = (scope: string) =>
  storageKey(scope, `plan:${localDate()}`);
export const validIds = (x: unknown): x is number[] =>
  Array.isArray(x) && x.every((i) => Number.isInteger(i) && i > 0);
