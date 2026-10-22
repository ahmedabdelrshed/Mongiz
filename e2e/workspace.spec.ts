import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

test("Story points navigation loads a project, filters stories and saves each project's estimation field on desktop and mobile", async ({ page }, testInfo) => {
  const { calls } = await azureFixture(page, true);
  await page.route("**/_apis/wit/classificationnodes/iterations?*", async (route) => {
    const project = route.request().url().includes("project2") ? "Platform" : "OMS";
    await route.fulfill({ json: {
      id: 1, name: project, children: [{ id: 2, name: "Sprint 1" }],
    } });
  });
  await page.getByRole("link", { name: "Story points", exact: true }).click();
  await expect(page).toHaveURL(/\/story-points$/);
  await page.getByLabel("Project for story points").selectOption("project1");
  await expect(page.getByLabel("Story points for #10", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Story points for #20", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Story points for #11", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Filter sprint", exact: true }).click();
  await page.getByRole("dialog").getByText("OMS\\Sprint 1", { exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Filter story state", exact: true }).click();
  await page.getByRole("dialog").getByText("Active", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("No matching stories")).toBeVisible();
  await page.getByRole("button", { name: "Filter story state", exact: true }).click();
  await page.getByRole("dialog").getByText("New", { exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByLabel("Story points for #10", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Save story points for #10" }).click();
  await expect(page.getByText("Saved 3 story points for #10.")).toBeVisible();
  await expect(page.getByLabel("Story points for #10", { exact: true })).toHaveCount(0);
  await expect(page.getByText("All stories have story points")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Project for story points").selectOption("project2");
  await expect(page.getByLabel("Story points for #20", { exact: true })).toBeVisible();
  for (const element of [page.getByLabel("Story points for #20", { exact: true }), page.getByRole("button", { name: "Save story points for #20" })]) {
    const bounds = (await element.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: testInfo.outputPath("story-points-mobile.png"), fullPage: true });
  await page.getByLabel("Story points for #20", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Save story points for #20" }).click();
  await expect(page.getByText("Saved 0 story points for #20.")).toBeVisible();
  const patches = calls.filter((call) => Array.isArray(call.body));
  expect(patches.map((call) => call.body)).toEqual([
    [
      { op: "test", path: "/rev", value: 1 },
      { op: "add", path: "/fields/Microsoft.VSTS.Scheduling.StoryPoints", value: 3 },
    ],
    [
      { op: "test", path: "/rev", value: 1 },
      { op: "add", path: "/fields/Microsoft.VSTS.Scheduling.Effort", value: 0 },
    ],
  ]);
});

test("Excel export downloads all filtered rows with local edits, including offscreen tasks", async ({
  page,
}) => {
  const { calls } = await azureFixture(page, true, 500);
  await page.getByRole("link", { name: "My work", exact: true }).click();
  await page.getByLabel("Load project OMS").check();
  await page.getByRole("button", { name: "Load selected projects" }).click();
  await expect(page.getByLabel("Item 1000 estimate hours")).toBeVisible();
  await page.getByLabel("Item 1000 estimate hours").fill("8");
  await page.getByLabel("Item 1000 estimate hours").blur();
  await expect(page.getByLabel("Item 1499 estimate hours")).toHaveCount(0);
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toMatch(
    /^mongiz-my-work-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );
  expect(await download.failure()).toBeNull();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await download.path())!);
  expect(workbook.getWorksheet("User Stories")!.rowCount).toBe(2);
  const tasks = workbook.getWorksheet("Tasks")!;
  expect(tasks.rowCount).toBe(501);
  expect(tasks.getCell("A501").value).toBe(1499);
  expect(tasks.getCell("J2").value).toBe(8);
  expect(tasks.columnCount).toBe(13);
  expect(tasks.getCell("D2").value).toEqual({ text: "Item 1000", hyperlink: "https://dev.azure.com/company/OMS/_workitems/edit/1000" });
  expect(tasks.getCell("I2").value).toEqual({ text: "Item 10", hyperlink: "https://dev.azure.com/company/OMS/_workitems/edit/10" });
  expect(workbook.getWorksheet("User Stories")!.columnCount).toBe(10);
  expect(workbook.getWorksheet("User Stories")!.getCell("D2").value).toEqual({ text: "Item 10", hyperlink: "https://dev.azure.com/company/OMS/_workitems/edit/10" });
  expect(calls.filter((call) => Array.isArray(call.body))).toHaveLength(0);
  await page.getByLabel("Search work").fill("Item 1499");
  const filteredDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  await workbook.xlsx.readFile((await (await filteredDownload).path())!);
  expect(workbook.getWorksheet("Tasks")!.rowCount).toBe(2);
  expect(workbook.getWorksheet("Tasks")!.getCell("A2").value).toBe(1499);
  expect(workbook.getWorksheet("User Stories")!.getCell("A2").value).toBe(10);
  await page.setViewportSize({ width: 390, height: 844 });
  const exportButton = page.getByRole("button", { name: "Export Excel" });
  await expect(exportButton).toBeVisible();
  const bounds = (await exportButton.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
});
async function azureFixture(
  page: Page,
  withHours = false,
  taskCount = 1,
  taskState = "Closed",
  taskTitle = (id: number) => `Item ${id}`,
) {
  let nextCreatedId = 3000;
  const token = "OrgProjectsTestPAT123",
    calls: { url: string; body: any }[] = [];
  await page.route(
    /^https:\/\/(dev|vssps\.dev)\.azure\.com\//,
    async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname;
      const body = route.request().postDataJSON();
      calls.push({ url: url.href, body });
      expect(route.request().headers().authorization).toBe(
        `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
      );
      const second =
        path.includes("project2") ||
        url.searchParams.get("scopeDescriptor") === "scp.project2";
      let response: any,
        headers: Record<string, string> = {};
      if (path.endsWith("/connectionData"))
        response = {
          authenticatedUser: {
            id: "ahmed",
            properties: { Account: { $value: "ahmed@example.com" } },
          },
        };
      else if (path.endsWith("/_apis/projects"))
        response = {
          value: [
            { id: "project1", name: "OMS" },
            { id: "project2", name: "Platform" },
          ],
        };
      else if (/\/_apis\/projects\/project[12]$/.test(path))
        response = {
          id: second ? "project2" : "project1",
          defaultTeam: { id: second ? "team2" : "team1", name: "Default team" },
        };
      else if (path.includes("/descriptors/"))
        response = { value: second ? "scp.project2" : "scp.project1" };
      else if (path.endsWith("/graph/users")) {
        response = {
          value: [
            {
              descriptor: "aad.user",
              subjectKind: "user",
              origin: "aad",
              principalName: second
                ? "omar@example.com"
                : url.searchParams.has("continuationToken")
                  ? "sara@example.com"
                  : "ahmed@example.com",
              displayName: second
                ? "Omar"
                : url.searchParams.has("continuationToken")
                  ? "Sara"
                  : "Ahmed",
            },
          ],
        };
        if (!second && !url.searchParams.has("continuationToken"))
          headers = {
            "X-MS-ContinuationToken": "next-page",
            "Access-Control-Expose-Headers": "X-MS-ContinuationToken",
          };
      } else if (path.endsWith("/workitemtypecategories"))
        response = {
          value: [
            [
              "Microsoft.RequirementCategory",
              second ? "Product Backlog Item" : "User Story",
            ],
            ["Microsoft.TaskCategory", "Task"],
            ["Microsoft.EpicCategory", "Epic"],
            ["Microsoft.FeatureCategory", "Feature"],
          ].map(([referenceName, name]) => ({
            referenceName,
            defaultWorkItemType: { name },
          })),
        };
      else if (path.endsWith("/workitemtypes"))
        response = {
          value: [{ name: second ? "Product Backlog Item" : "User Story" }],
        };
      else if (path.endsWith("/workitemtypes/Task"))
        response = {
          fields: ["OriginalEstimate", "RemainingWork", "CompletedWork"].map(
            (f) => ({ referenceName: `Microsoft.VSTS.Scheduling.${f}` }),
          ),
          states: [{ name: "New" }, { name: "Active" }, { name: "Closed" }],
        };
      else if (path.includes("/workitemtypes/") && !path.endsWith("/Task"))
        response = {
          fields: [
            {
              referenceName: `Microsoft.VSTS.Scheduling.${second ? "Effort" : "StoryPoints"}`,
            },
          ],
          states: [{ name: "New" }, { name: "Active" }, { name: "Closed" }],
        };
      else if (path.endsWith("/teamsettings"))
        response = { backlogIteration: { path: second ? "Platform" : "OMS" } };
      else if (path.endsWith("/iterations"))
        response = {
          value: withHours
            ? [
                {
                  id: second ? "s2" : "s1",
                  name: "Sprint 1",
                  path: `${second ? "Platform" : "OMS"}\\Sprint 1`,
                  attributes: {
                    timeFrame: "current",
                    startDate: "2026-10-01T00:00:00Z",
                    finishDate: "2026-10-14T00:00:00Z",
                  },
                },
              ]
            : [],
        };
      else if (path.endsWith("/teamfieldvalues"))
        response = { defaultValue: second ? "Platform" : "OMS" };
      else if (path.endsWith("/wiql"))
        response = {
          workItems: body.query.includes("ORDER BY [System.Id]")
            ? [
                { id: second ? 20 : 10 },
                ...(withHours
                  ? second
                    ? [{ id: 21 }]
                    : taskCount === 1
                      ? [{ id: 11 }]
                      : Array.from({ length: taskCount }, (_, i) => ({
                          id: 1000 + i,
                        }))
                  : []),
              ]
            : [{ id: 100 }, { id: 120 }],
        };
      else if (path.endsWith("/workitemsbatch")) {
        const raw = (
          id: number,
          type: string,
          project: string,
          parent?: number,
        ) => ({
          id,
          rev: 1,
          fields: {
            "System.Title": type === "Task" ? taskTitle(id) : `Item ${id}`,
            "System.WorkItemType": type,
            "System.TeamProject": project,
            "System.State": type === "Task" ? taskState : "New",
            "System.AssignedTo": "ahmed@example.com",
            "System.IterationPath": withHours
              ? `${project}\\Sprint 1`
              : project,
            ...(type === "Task"
              ? {
                  "Microsoft.VSTS.Scheduling.OriginalEstimate":
                    project === "OMS" ? 3 : 7,
                  "Microsoft.VSTS.Scheduling.CompletedWork":
                    project === "OMS" ? 2 : 4,
                }
              : {}),
          },
          relations: parent
            ? [
                {
                  rel: "System.LinkTypes.Hierarchy-Reverse",
                  url: `https://dev.azure.com/company/_apis/wit/workItems/${parent}`,
                },
              ]
            : [],
        });
        response = {
          value: [
            raw(10, "User Story", "OMS"),
            raw(20, "Product Backlog Item", "Platform"),
            ...(withHours
              ? [
                  ...(taskCount === 1
                    ? [raw(11, "Task", "OMS", 10)]
                    : Array.from({ length: taskCount }, (_, i) =>
                        raw(1000 + i, "Task", "OMS", 10),
                      )),
                  raw(21, "Task", "Platform", 20),
                ]
              : []),
            raw(100, "Epic", "OMS"),
            raw(120, "Feature", "OMS", 100),
          ].filter((i) => body.ids.includes(i.id)),
        };
      } else if (
        path.includes("/_apis/wit/workitems/$") &&
        route.request().method() === "POST"
      ) {
        response = {
          id: nextCreatedId++,
          rev: 1,
          fields: {
            "System.TeamProject": second ? "Platform" : "OMS",
            "System.WorkItemType": decodeURIComponent(path.split("$").pop()!),
            "System.State": "New",
            ...Object.fromEntries(
              body
                .filter((p: any) => p.path.startsWith("/fields/"))
                .map((p: any) => [p.path.slice(8), p.value]),
            ),
          },
        };
      } else if (
        /\/_apis\/wit\/workitems\/\d+$/i.test(path) &&
        route.request().method() === "PATCH"
      ) {
        const id = Number(path.split("/").pop());
        const isTask = id === 11 || id === 21 || (id >= 1000 && id < 1000 + taskCount);
        const project = id === 20 || id === 21 ? "Platform" : "OMS";
        const changes = Object.fromEntries(
          body
            .filter((p: any) => p.op === "add")
            .map((p: any) => [p.path.slice(8), p.value]),
        );
        response = {
          id,
          rev: 2,
          fields: {
            "System.Title": isTask ? taskTitle(id) : `Item ${id}`,
            "System.WorkItemType":
              isTask ? "Task" : id === 10 ? "User Story" : "Product Backlog Item",
            "System.TeamProject": project,
            "System.State": isTask ? taskState : "New",
            "System.AssignedTo": "ahmed@example.com",
            "System.IterationPath": withHours ? `${project}\\Sprint 1` : project,
            ...changes,
          },
        };
      } else throw new Error(`Unexpected Azure request ${url.href}`);
      await route.fulfill({ json: response, headers });
    },
  );
  await page.goto("/settings");
  await page.getByLabel("Organization name").fill("company");
  await page.getByLabel(/^Personal access token/).fill(token);
  await page.getByRole("button", { name: "Connect with token" }).click();
  await expect(page.getByText(/Connected as ahmed/)).toBeVisible();
  return { token, calls };
}
test("Azure sign-in skips project/team; My Work reads all projects and creation picks its own destination", async ({
  page,
}) => {
  const { token, calls } = await azureFixture(page);
  await expect(page.getByLabel("Project", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Team", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "My work", exact: true }).click();
  await page.getByLabel("Load project OMS").check();
  await page.getByLabel("Load project Platform").check();
  await page.getByRole("button", { name: "Load selected projects" }).click();
  await page.getByLabel("Filter destination").selectOption("all");
  await expect(
    page.getByRole("heading", { name: "Item 10", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Item 20", exact: true }),
  ).toBeVisible();
  const wiql = calls.find((c) =>
    c.body?.query?.includes("ORDER BY [System.Id]"),
  )!;
  expect(wiql.url).toContain("/_apis/wit/wiql");
  expect(wiql.body.query).toContain("[System.TeamProject] = @project");
  await page.getByLabel("Select all user stories", { exact: true }).check();
  await page.getByLabel("Bulk story points").fill("5");
  await page.getByLabel("Bulk story state").selectOption("Active");
  await page.getByRole("button", { name: "Apply to selected stories" }).click();
  await expect(page.getByLabel("Item 10 story points")).toHaveValue("5");
  await expect(page.getByLabel("Item 20 story points")).toHaveValue("5");
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.getByText(/Saved changes to 2 work items/)).toBeVisible();
  const patches = calls.filter((c) => Array.isArray(c.body));
  expect(
    patches.find((c) => c.url.includes("/workitems/10"))?.body,
  ).toContainEqual({
    op: "add",
    path: "/fields/Microsoft.VSTS.Scheduling.StoryPoints",
    value: 5,
  });
  expect(
    patches.find((c) => c.url.includes("/workitems/20"))?.body,
  ).toContainEqual({
    op: "add",
    path: "/fields/Microsoft.VSTS.Scheduling.Effort",
    value: 5,
  });
  await page
    .getByRole("link", { name: "Create stories", exact: true })
    .first()
    .click();
  await page.getByLabel("Destination project").selectOption("project1");
  await expect(page.getByLabel("Epic", { exact: true })).toBeEnabled();
  await expect(
    page
      .getByLabel("Assign all to")
      .locator("option[value='sara@example.com']"),
  ).toHaveCount(1);
  await expect(
    page
      .getByLabel("Assign all to")
      .locator("option[value='omar@example.com']"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.stringify([localStorage, sessionStorage])),
  ).not.toContain(token);
  await page.screenshot({ path: "docs/desktop-preview.png", fullPage: true });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Workspace settings" }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Personal access token/)).toBeVisible();
});

test("switches list projects with pending edits while hours total all accessible projects", async ({
  page,
}) => {
  const { token, calls } = await azureFixture(page, true);
  await page.getByRole("link", { name: "My work", exact: true }).click();
  await expect(page.getByLabel("Load project OMS")).toBeVisible();
  await expect(page.getByText("Estimated: 10h").first()).toBeVisible();
  await expect(page.getByLabel("Filter user")).toHaveCount(0);
  await page.getByLabel("Load project OMS").check();
  await page.getByRole("button", { name: "Load selected projects" }).click();
  await page.getByLabel("Filter destination").selectOption("all");
  await expect(
    page.getByRole("heading", { name: "Item 10", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Item 20", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Platform", exact: true }),
  ).toHaveCount(0);
  const workRequests = calls.filter(
    (c) => c.url.includes("/wiql") || c.url.includes("/workitemsbatch"),
  );
  expect(workRequests.length).toBeGreaterThan(0);
  expect(workRequests.some((c) => c.url.includes("/project1/"))).toBe(true);
  expect(workRequests.some((c) => c.url.includes("/project2/"))).toBe(true);
  expect(
    calls.some((c) =>
      c.url.includes("/project2/_apis/wit/workitemtypecategories"),
    ),
  ).toBe(true);
  const selections = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("taskflow:v1:work-project-selections")!),
  );
  expect(Object.values(selections)).toEqual([["project1"]]);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "My work", exact: true }).click();
  await expect(
    page.getByText("Loading only: OMS.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel(/^Personal access token/).fill(token);
  await page.getByRole("button", { name: "Connect with token" }).click();
  await expect(page.getByText(/Connected as ahmed/)).toBeVisible();
  await page.getByRole("link", { name: "My work", exact: true }).click();
  await expect(
    page.getByText("Loading only: OMS.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Filter destination").selectOption("all");
  await page.getByLabel("Item 10 story points").fill("6");
  await expect(
    page.getByRole("button", { name: "Change my projects" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Change my projects" }).click();
  await page.getByLabel("Load project OMS").uncheck();
  await page.getByLabel("Load project Platform").check();
  await page.getByRole("button", { name: "Load selected projects" }).click();
  await expect(
    page.getByRole("heading", { name: "Item 20", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Item 10", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Estimated: 10h").first()).toBeVisible();
  await expect(page.getByLabel("Calculation sprint")).toHaveValue("current");
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.getByText("Saved changes to 1 work items.")).toBeVisible();
  expect(
    calls.some(
      (c) =>
        /workitems\/10\?/i.test(c.url) &&
        Array.isArray(c.body) &&
        c.body.some(
          (p: any) => p.path.endsWith("StoryPoints") && p.value === 6,
        ),
    ),
  ).toBe(true);
});

test("startup and reloading protected routes show Azure connection with no demo controls", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "taskflow:v1:settings",
      JSON.stringify({
        mode: "demo",
        organization: "company",
        authMethod: "pat",
        clientId: "",
        tenantId: "",
        project: "",
        team: "",
      }),
    ),
  );
  await page.goto("/work");
  await expect(
    page.getByRole("heading", { name: "Workspace settings" }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Personal access token/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Use demo mode" })).toHaveCount(
    0,
  );
  await expect(page.getByText("Demo workspace", { exact: true })).toHaveCount(
    0,
  );
});
test("500 tasks are virtualized, edits survive scrolling, and sidebar stays fixed", async ({
  page,
}) => {
  await azureFixture(page, true, 500);
  await page.getByRole("link", { name: "My work", exact: true }).click();
  await page.getByLabel("Load project OMS").check();
  await page.getByRole("button", { name: "Load selected projects" }).click();
  await expect(page.getByLabel("Item 1000 estimate hours")).toBeVisible();
  const list = page.getByRole("list", { name: "Stories and tasks" });
  expect(await list.locator(".work-row").count()).toBeLessThan(40);
  await expect(page.getByLabel("Item 1499 estimate hours")).toHaveCount(0);
  await page.getByLabel("Item 1000 estimate hours").fill("8");
  await page.getByLabel("Item 1000 estimate hours").blur();
  const sidebar = await page.locator(".sidebar").boundingBox();
  await expect
    .poll(async () => {
      await list.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      return page.getByLabel("Item 1499 estimate hours").isVisible();
    })
    .toBe(true);
  expect(await list.locator(".work-row").count()).toBeLessThan(40);
  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(page.getByLabel("Item 1000 estimate hours")).toHaveValue("8");
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByLabel("Item 1000 estimate hours")).toHaveValue("8");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect((await page.locator(".sidebar").boundingBox())!.y).toBe(sidebar!.y);
  await page.screenshot({
    path: "docs/my-work-virtualized-preview.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/my-work-virtualized-mobile-preview.png",
    fullPage: true,
  });
});

test("Azure SRS creation submits stories and default tasks then clears the form", async ({
  page,
}) => {
  const { calls } = await azureFixture(page);
  await page.getByRole("link", { name: "Create stories", exact: true }).click();
  await expect(page.getByLabel("Paste SRS requirements")).toHaveCount(0);
  await page.getByLabel("Destination project").selectOption("project1");
  await expect(page.getByLabel("Epic", { exact: true })).toBeEnabled();
  await page.getByLabel("Epic", { exact: true }).selectOption("100");
  await page.getByLabel("Parent Feature", { exact: true }).selectOption("120");
  await page
    .getByLabel("Assign all to", { exact: true })
    .selectOption("ahmed@example.com");
  await page.getByLabel("Destination", { exact: true }).selectOption("backlog");
  await page
    .getByLabel("Paste SRS requirements")
    .fill("SRS.1 Print report\nSRS.2 Search devices");
  await page.getByRole("button", { name: "Add 2 stories to batch" }).click();
  await page
    .getByLabel("Shared title — Frontend implementation")
    .fill("Build frontend screens");
  await expect(page.getByLabel("Story 1 task 1 title")).toHaveValue(
    "Build frontend screens",
  );
  await expect(page.getByLabel("Story 2 task 1 title")).toHaveValue(
    "Build frontend screens",
  );
  const frontend = (await page
    .getByRole("region", { name: "Frontend shared tasks" })
    .boundingBox())!;
  const backend = (await page
    .getByRole("region", { name: "Backend shared tasks" })
    .boundingBox())!;
  expect(frontend.y).toBe(backend.y);
  expect(frontend.x + frontend.width).toBeLessThan(backend.x);
  await page.screenshot({
    path: "test-results/shared-tasks-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileFrontend = (await page
    .getByRole("region", { name: "Frontend shared tasks" })
    .boundingBox())!;
  const mobileBackend = (await page
    .getByRole("region", { name: "Backend shared tasks" })
    .boundingBox())!;
  expect(mobileFrontend.x).toBe(mobileBackend.x);
  expect(mobileFrontend.y + mobileFrontend.height).toBeLessThan(
    mobileBackend.y,
  );
  await page.screenshot({
    path: "test-results/shared-tasks-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Review batch" }).click();
  await page
    .getByRole("button", { name: "Create 2 stories + 18 tasks" })
    .click();
  await expect(page.getByText(/20 of 20 items created/)).toBeVisible();
  await expect(page.getByLabel("Destination project")).toHaveValue("");
  await expect(page.getByLabel("Paste SRS requirements")).toHaveCount(0);
  const creates = calls.filter((c) => c.url.includes("/workitems/$"));
  expect(creates).toHaveLength(20);
  expect(
    creates.filter((call) =>
      call.body.some(
        (patch: any) =>
          patch.path === "/fields/System.Title" &&
          patch.value === "Build frontend screens",
      ),
    ),
  ).toHaveLength(2);
  expect(
    creates.every(
      (c) => !c.body.some((p: any) => /System.Tags|RemainingWork/.test(p.path)),
    ),
  ).toBe(true);
});

test("My Work search resets a scrolled list and fills every filtered task including offscreen rows", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00Z"));
  const { calls } = await azureFixture(page, true, 80, "Closed", (id) => `Implement frontend ${id}`);
  await page.getByRole("link", { name: "My work", exact: true }).click();
  await page.getByLabel("Load project OMS").check();
  await page.getByRole("button", { name: "Load selected projects" }).click();
  await expect(page.getByLabel("Implement frontend 1000 estimate hours")).toBeVisible();
  const list = page.getByRole("list", { name: "Stories and tasks" });
  await expect.poll(async () => {
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    return page.getByLabel("Implement frontend 1079 estimate hours").isVisible();
  }).toBe(true);
  const search = page.getByLabel("Search work");
  await search.fill(" #1079 ");
  await expect(page.getByLabel("Implement frontend 1079 estimate hours")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Item 10", exact: true })).toBeVisible();
  await search.fill("");
  await search.pressSequentially("  ITEM 10  ");
  await expect(page.getByLabel("Implement frontend 1000 estimate hours")).toBeVisible();
  await expect(page.getByLabel("Implement frontend 1079 estimate hours")).toHaveCount(0);
  await page.getByLabel("Sprint target maximum").fill("400");
  await page.getByLabel("Sprint target minimum").fill("300");
  await page.getByLabel("Calculation user").selectOption("omar@example.com");
  await page.getByRole("button", { name: "Fill sprint minimum" }).click();
  await expect(page.getByText(/80 tasks staged/)).toBeVisible();
  await expect(page.getByLabel("Implement frontend 1000 estimate hours")).toHaveValue("3.75");
  await expect(page.getByLabel("Implement frontend 1000 completed hours")).toHaveValue("3.75");
  expect(calls.filter((call) => Array.isArray(call.body))).toHaveLength(0);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("taskflow:v1:ahmed@example.com:company:all-projects:work-edits")!));
  expect(Object.keys(draft)).toHaveLength(80);
  expect(draft[1079].values).toEqual({
    "Microsoft.VSTS.Scheduling.OriginalEstimate": 3.75,
    "Microsoft.VSTS.Scheduling.CompletedWork": 3.75,
  });
  await expect.poll(async () => {
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    return page.getByLabel("Implement frontend 1079 completed hours").isVisible();
  }).toBe(true);
  await expect(page.getByLabel("Implement frontend 1079 completed hours")).toHaveValue("3.75");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await search.fill(" #1079 ");
  await expect(page.getByLabel("Implement frontend 1079 estimate hours")).toHaveValue("3");
  await expect(page.getByLabel("Implement frontend 1079 completed hours")).toHaveValue("2");
  await page.screenshot({ path: testInfo.outputPath("my-work-fill-desktop.png"), fullPage: true });
});

test("My Work category actions fit mobile and save only the searched task's hours", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00Z"));
  const { calls } = await azureFixture(page, true, 3, "Active", (id) =>
    id === 1000 ? "Unit testing" : "Frontend code review",
  );
  await page.getByRole("link", { name: "My work", exact: true }).click();
  await page.getByLabel("Load project OMS").check();
  await page.getByRole("button", { name: "Load selected projects" }).click();
  await expect(page.getByLabel("Unit testing estimate hours")).toBeVisible();
  await page.getByLabel("Search work").fill(" #1000 ");
  const actions = page.getByRole("region", { name: "Fill sprint hours" });
  await actions.getByRole("button", { name: "Testing", exact: true }).click();
  await expect(actions.getByRole("button", { name: "Testing", exact: true })).toHaveAttribute("aria-pressed", "true");
  await actions.getByRole("button", { name: "Fill sprint minimum" }).click();
  await expect(page.getByLabel("Unit testing estimate hours")).toHaveValue("30");
  await expect(page.getByLabel("Unit testing completed hours")).toHaveValue("30");
  await expect(page.getByLabel("Unit testing state")).toHaveValue("Active");
  expect(calls.filter((call) => Array.isArray(call.body))).toHaveLength(0);
  for (const button of await actions.getByRole("button").all()) {
    const bounds = (await button.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: testInfo.outputPath("my-work-fill-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("status", { name: "How task changes work" }).focus();
  await expect(page.locator(".notice-tooltip").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.getByText("Saved changes to 1 work items.")).toBeVisible();
  const patches = calls.filter((call) => Array.isArray(call.body));
  expect(patches).toHaveLength(1);
  expect(patches[0].url).toMatch(/workitems\/1000\?/i);
  expect(patches[0].body).toEqual([
    { op: "test", path: "/rev", value: 1 },
    { op: "add", path: "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate", value: 30 },
    { op: "add", path: "/fields/Microsoft.VSTS.Scheduling.CompletedWork", value: 30 },
  ]);
});

test("completed work changes only with status and all-project hour bars preview closures before Save", async ({
  page,
}) => {
  const { calls } = await azureFixture(page, true, 1, "Active");
  await page.getByRole("link", { name: "My work", exact: true }).click();
  await page.getByLabel("Load project OMS").check();
  await page.getByRole("button", { name: "Load selected projects" }).click();
  await expect(page.getByLabel("Item 11 completed hours")).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: /Save changes/ }),
  ).toBeDisabled();
  const sprint = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Current sprint", exact: true }),
    });
  await expect(sprint.getByText("Completed: 6h")).toBeVisible();
  await page.getByLabel("Item 11 estimate hours").fill("5");
  await expect(page.getByLabel("Item 11 completed hours")).toHaveValue("2");
  await page.getByLabel("Item 11 state").selectOption("Closed");
  await expect(sprint.getByText("Completed: 9h")).toBeVisible();
  await expect(sprint.getByText("Estimated: 12h")).toBeVisible();
  expect(
    calls.filter(
      (c) => Array.isArray(c.body) && c.body.some((p: any) => p.op === "test"),
    ),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(sprint.getByText("Completed: 6h")).toBeVisible();
  await expect(page.getByLabel("Item 11 completed hours")).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: /Save changes/ }),
  ).toBeDisabled();
});
