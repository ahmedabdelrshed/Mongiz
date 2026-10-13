import ExcelJS from "exceljs";
import type { WorkItem } from "../../shared/api/types";

export interface WorkItemsExport {
  stories: WorkItem[];
  tasks: WorkItem[];
  today: boolean;
}

export function buildWorkItemsWorkbook(data: WorkItemsExport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mongiz";
  const stories = new Map(data.stories.map((item) => [item.id, item]));
  const linkedTitle = (item: WorkItem) =>
    item.url ? { text: item.title, hyperlink: item.url } : item.title;
  const commonColumns = [
    { header: "ID", key: "id", width: 12 },
    { header: "Project", key: "project", width: 24 },
    { header: "Type", key: "type", width: 24 },
    { header: "Title", key: "title", width: 60 },
    { header: "State", key: "state", width: 18 },
    { header: "Assigned to", key: "assignedTo", width: 32 },
    { header: "Iteration", key: "iteration", width: 36 },
    { header: "Parent ID", key: "parentId", width: 12 },
  ];
  for (const [name, items, isStory] of [
    ["User Stories", data.stories, true],
    ["Tasks", data.tasks, false],
  ] as const) {
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = [
      ...commonColumns,
      ...(isStory
        ? [{ header: "Story points", key: "storyPoints", width: 16 }]
        : [
            { header: "Parent story", key: "parentTitle", width: 60 },
            { header: "Original estimate (h)", key: "estimate", width: 24 },
            { header: "Remaining work (h)", key: "remaining", width: 24 },
            { header: "Completed work (h)", key: "completed", width: 24 },
          ]),
      { header: "Tags", key: "tags", width: 30 },
    ];
    for (const item of items) {
      // Hyperlink text remains literal, even when titles begin with '=' or '+'.
      const parent = item.parentId ? stories.get(item.parentId) : undefined;
      const row = sheet.addRow({
        ...item,
        title: linkedTitle(item),
        parentTitle: parent ? linkedTitle(parent) : undefined,
      });
      row.alignment = { vertical: "top", wrapText: true };
      for (const key of isStory ? ["title"] : ["title", "parentTitle"]) {
        const cell = row.getCell(key);
        if (cell.type === ExcelJS.ValueType.Hyperlink)
          cell.font = { color: { argb: "FF0563C1" }, underline: true };
      }
    }
    for (const key of isStory
      ? ["storyPoints"]
      : ["estimate", "remaining", "completed"]) {
      sheet.getColumn(key).numFmt = "0.##";
    }
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    header.height = 30;
    header.alignment = { vertical: "middle", wrapText: true };
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount },
    };
  }
  return workbook;
}

export async function exportWorkItems(data: WorkItemsExport) {
  const workbook = buildWorkItemsWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  link.href = url;
  link.download = `mongiz-${data.today ? "today-plan" : "my-work"}-${date}.xlsx`;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to start consuming the download before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
