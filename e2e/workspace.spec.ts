import { test, expect, type Page } from "@playwright/test";
async function azureFixture(
  page: Page,
  withHours = false,
  taskCount = 1,
  taskState = "Closed",
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
            "System.Title": `Item ${id}`,
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
        const changes = Object.fromEntries(
          body
            .filter((p: any) => p.op === "add")
            .map((p: any) => [p.path.slice(8), p.value]),
        );
        response = {
          id,
          rev: 2,
          fields: {
            "System.Title": `Item ${id}`,
            "System.WorkItemType":
              id === 10 ? "User Story" : "Product Backlog Item",
            "System.TeamProject": id === 10 ? "OMS" : "Platform",
            "System.State": "New",
            "System.AssignedTo": "ahmed@example.com",
            "System.IterationPath": id === 10 ? "OMS" : "Platform",
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
  await page.getByRole("button", { name: "Review batch" }).click();
  await page
    .getByRole("button", { name: "Create 2 stories + 18 tasks" })
    .click();
  await expect(page.getByText(/20 of 20 items created/)).toBeVisible();
  await expect(page.getByLabel("Destination project")).toHaveValue("");
  const creates = calls.filter((c) => c.url.includes("/workitems/$"));
  expect(creates).toHaveLength(20);
  expect(
    creates.every(
      (c) => !c.body.some((p: any) => /System.Tags|RemainingWork/.test(p.path)),
    ),
  ).toBe(true);
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
