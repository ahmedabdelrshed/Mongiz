import { readStored, storageKey } from "../../shared/storage/storage";
export interface TaskTemplate {
  id: string;
  name: string;
  tasks: { title: string; hours: number }[];
}
export const defaultTemplates: TaskTemplate[] = [
  {
    id: "feature",
    name: "Frontend feature",
    tasks: [
      { title: "Analyze requirements", hours: 2 },
      { title: "Build UI", hours: 4 },
      { title: "Integrate API", hours: 2 },
      { title: "Test feature", hours: 2 },
      { title: "Document changes", hours: 1 },
    ],
  },
];
export const validTemplates = (x: unknown): x is TaskTemplate[] =>
  Array.isArray(x) &&
  x.every(
    (t) =>
      t &&
      typeof t.id === "string" &&
      typeof t.name === "string" &&
      Array.isArray(t.tasks) &&
      t.tasks.every(
        (a: any) =>
          typeof a.title === "string" &&
          typeof a.hours === "number" &&
          Number.isFinite(a.hours) &&
          a.hours >= 0,
      ),
  );
export const getTemplates = (scope: string) =>
  readStored(storageKey(scope, "templates"), defaultTemplates, validTemplates);
