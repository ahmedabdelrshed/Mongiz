import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { WorkItem } from "../../shared/api/types";
import { buildWorkItemsWorkbook } from "./exportWorkItems";

const story: WorkItem = {
  id: 10,
  rev: 2,
  project: "OMS",
  type: "Product Backlog Item",
  title: "=SUM(1,2) — قصة & <test>",
  state: "Active",
  assignedTo: "ahmed@example.com",
  iteration: "OMS\\Sprint 1",
  parentId: 3,
  storyPoints: 0,
  tags: "one; two",
  url: "https://dev.azure.com/company/_workitems/edit/10",
};

it("round-trips a real xlsx with story relationships, literal text and numeric blanks/zeros", async () => {
  const workbook = buildWorkItemsWorkbook({
    stories: [story],
    tasks: [
      {
        ...story,
        id: 11,
        type: "Task",
        title: "+Review\nSecond line",
        parentId: 10,
        estimate: 3.5,
        remaining: 0,
        completed: undefined,
        url: "https://dev.azure.com/company/_workitems/edit/11",
      },
      { ...story, id: 12, type: "Task", parentId: 999, url: undefined },
    ],
    today: false,
  });
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  expect(reopened.worksheets.map((sheet) => sheet.name)).toEqual([
    "User Stories",
    "Tasks",
  ]);
  const stories = reopened.getWorksheet("User Stories")!;
  const tasks = reopened.getWorksheet("Tasks")!;
  expect(stories.getCell("D2").value).toEqual({
    text: story.title,
    hyperlink: story.url,
  });
  expect(stories.getCell("D2").type).toBe(ExcelJS.ValueType.Hyperlink);
  expect(stories.getCell("I2").value).toBe(0);
  expect(stories.columnCount).toBe(10);
  expect(tasks.columnCount).toBe(13);
  expect(tasks.rowCount).toBe(3);
  expect(tasks.getCell("D2").value).toEqual({
    text: "+Review\nSecond line",
    hyperlink: "https://dev.azure.com/company/_workitems/edit/11",
  });
  expect(tasks.getCell("H2").value).toBe(10);
  expect(tasks.getCell("I2").value).toEqual({
    text: story.title,
    hyperlink: story.url,
  });
  expect(tasks.getCell("J2").value).toBe(3.5);
  expect(tasks.getCell("K2").value).toBe(0);
  expect(tasks.getCell("L2").value).toBeNull();
  expect(tasks.getCell("D3").value).toBe(story.title);
  expect(tasks.getCell("H3").value).toBe(999);
  expect(tasks.getCell("I3").value).toBeNull();
  expect(tasks.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  expect(tasks.autoFilter).toBe("A1:M3");
});

it("keeps headers on empty sheets and exports every row of a large view", () => {
  const workbook = buildWorkItemsWorkbook({
    stories: [],
    tasks: Array.from({ length: 500 }, (_, index) => ({
      ...story,
      id: 1000 + index,
      type: "Task",
    })),
    today: true,
  });
  expect(workbook.getWorksheet("User Stories")!.rowCount).toBe(1);
  expect(workbook.getWorksheet("Tasks")!.rowCount).toBe(501);
  expect(workbook.getWorksheet("Tasks")!.getCell("A501").value).toBe(1499);
});
