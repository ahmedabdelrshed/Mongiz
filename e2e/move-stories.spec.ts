import { test, expect, type Page } from "@playwright/test";

async function fixture(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projects = [
    { id: "p1", name: "OMS" },
    { id: "p2", name: "Platform" },
  ];
  const records = new Map<number, any>();
  for (const [index, project] of projects.entries()) {
    const storyId = (index + 1) * 10;
    for (const offset of [0, 1, 2]) {
      const id = storyId + offset;
      records.set(id, {
        id,
        rev: 1,
        fields: {
          "System.Title": offset ? `Task ${id}` : `${project.name} story`,
          "System.TeamProject": project.name,
          "System.WorkItemType": offset ? "Task" : "User Story",
          "System.State": offset === 2 ? "Closed" : "Active",
          "System.AssignedTo": offset
            ? "other@example.com"
            : "owner@example.com",
          "System.IterationPath": offset
            ? `${project.name}\\Another iteration`
            : `${project.name}\\Old sprint`,
        },
        relations: offset
          ? [
              {
                rel: "System.LinkTypes.Hierarchy-Reverse",
                url: `https://dev.azure.com/company/_apis/wit/workItems/${storyId}`,
              },
            ]
          : [],
      });
    }
  }
  const patches: { id: number; body: any[] }[] = [];
  const workQueries: string[] = [];
  let failTask = true;
  await page.route(
    /^https:\/\/(dev|vssps\.dev)\.azure\.com\//,
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = decodeURIComponent(url.pathname);
      const project =
        path.includes("/p2/") || path.endsWith("/p2")
          ? projects[1]
          : projects[0];
      const body = request.postDataJSON();
      let json: any;
      if (path.endsWith("/connectionData"))
        json = {
          authenticatedUser: {
            id: "owner",
            properties: { Account: { $value: "owner@example.com" } },
          },
        };
      else if (path.endsWith("/_apis/projects")) json = { value: projects };
      else if (/\/_apis\/projects\/p[12]$/.test(path))
        json = { id: project.id, defaultTeam: { id: "team", name: "Team" } };
      else if (path.includes("/descriptors/")) json = { value: "scope" };
      else if (path.endsWith("/graph/users")) json = { value: [] };
      else if (path.endsWith("/workitemtypecategories"))
        json = {
          value: [
            {
              referenceName: "Microsoft.RequirementCategory",
              defaultWorkItemType: { name: "User Story" },
            },
            {
              referenceName: "Microsoft.TaskCategory",
              defaultWorkItemType: { name: "Task" },
            },
          ],
        };
      else if (path.includes("/workitemtypes/"))
        json = {
          fields: [],
          states: ["New", "Active", "Closed"].map((name) => ({ name })),
        };
      else if (path.endsWith("/classificationnodes/iterations"))
        json = {
          id: 1,
          name: project.name,
          hasChildren: true,
          children: [
            { id: 2, name: "Old sprint", hasChildren: false },
            {
              id: 3,
              name: "Release",
              hasChildren: true,
              children: [
                { id: 4, name: "Other team's sprint", hasChildren: false },
              ],
            },
          ],
        };
      else if (path.endsWith("/teamsettings"))
        json = { backlogIteration: { path: project.name } };
      else if (path.endsWith("/teamsettings/iterations"))
        json = {
          value: [
            {
              id: "old",
              name: "Old sprint",
              path: `${project.name}\\Old sprint`,
              attributes: { timeFrame: "current" },
            },
          ],
        };
      else if (path.endsWith("/wiql")) {
        workQueries.push(path);
        expect(body.query).not.toContain("System.AssignedTo");
        json = {
          workItems: [...records.values()]
            .filter((r) => r.fields["System.TeamProject"] === project.name)
            .map((r) => ({ id: r.id })),
        };
      } else if (path.endsWith("/workitemsbatch"))
        json = {
          value: body.ids.map((id: number) => records.get(id)).filter(Boolean),
        };
      else if (
        /\/_apis\/wit\/workitems\/\d+$/.test(path) &&
        request.method() === "PATCH"
      ) {
        const id = Number(path.split("/").pop());
        patches.push({ id, body });
        const record = records.get(id);
        expect(body[0]).toEqual({
          op: "test",
          path: "/rev",
          value: record.rev,
        });
        expect(body).toHaveLength(2);
        expect(body[1].path).toBe("/fields/System.IterationPath");
        if (id === 11 && failTask) {
          failTask = false;
          await route.fulfill({
            status: 409,
            json: { message: "Revision conflict" },
          });
          return;
        }
        record.rev++;
        record.fields["System.IterationPath"] = body[1].value;
        json = record;
      } else throw new Error(`Unexpected Azure request ${url.href}`);
      await route.fulfill({ json });
    },
  );
  await page.goto("/settings");
  await page.getByLabel("Organization name").fill("company");
  await page
    .getByLabel(/^Personal access token/)
    .fill("MoveStoriesFixturePAT123");
  await page.getByRole("button", { name: "Connect with token" }).click();
  await expect(page.getByText(/Connected as owner/)).toBeVisible();
  return { records, patches, workQueries, errors };
}
async function chooseTaskStatus(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Task statuses to move", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Task statuses to move options" })
    .getByText(name, { exact: true })
    .click();
  await page.keyboard.press("Escape");
}

test("reviews exact stories/tasks and retries partial failures without repeating successful moves", async ({
  page,
}, testInfo) => {
  const { patches, records, workQueries, errors } = await fixture(page);
  await page.getByRole("link", { name: "Move stories", exact: true }).click();
  await page.getByLabel("Project to move stories").selectOption("p1");
  await expect(page.getByLabel("Select story #10: OMS story")).toBeVisible();
  expect(workQueries).toEqual(["/company/p1/_apis/wit/wiql"]);
  await expect(
    page.getByRole("button", { name: "Task statuses to move", exact: true }),
  ).toHaveText("None selected");
  await page.getByLabel("Search stories", { exact: true }).fill("10");
  await page
    .getByLabel("Source iteration", { exact: true })
    .selectOption("OMS\\Old sprint");
  await page.getByLabel("Select all filtered stories").check();
  await page
    .getByLabel("Destination iteration", { exact: true })
    .selectOption("OMS\\Release\\Other team's sprint");
  await chooseTaskStatus(page, "Active");
  await chooseTaskStatus(page, "Closed");
  await page.getByRole("button", { name: "Review move", exact: true }).click();
  const review = page.getByRole("region", { name: "Review move", exact: true });
  await expect(review).toContainText("1 stories and 2 tasks will change");
  await expect(review).toContainText("#11 Task 11");
  await expect(review).toContainText("#12 Task 12");
  expect(patches).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("review-desktop.png"),
    fullPage: true,
  });
  await review.getByRole("button", { name: "Move", exact: true }).click();
  const results = page.getByRole("region", { name: "Move results" });
  await expect(results).toContainText("2 moved · 1 failed");
  expect(patches.map((p) => p.id)).toEqual([10, 11, 12]);
  await results.getByRole("button", { name: "Retry failed" }).click();
  await expect(
    page.getByRole("heading", { name: "Review unfinished changes" }),
  ).toBeVisible();
  await expect(review).toContainText("0 stories and 1 tasks will change");
  await review.getByRole("button", { name: "Move", exact: true }).click();
  await expect(results).toContainText("3 moved · 0 failed");
  expect(patches.map((p) => p.id)).toEqual([10, 11, 12, 11]);
  expect(
    [10, 11, 12].every(
      (id) =>
        records.get(id).fields["System.IterationPath"] ===
        "OMS\\Release\\Other team's sprint",
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("supports mobile review and clears selections and task statuses when changing projects", async ({
  page,
}, testInfo) => {
  const { patches, errors } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Move stories", exact: true }).click();
  await page.getByLabel("Project to move stories").selectOption("p1");
  await page.getByLabel("Select story #10: OMS story").check();
  await chooseTaskStatus(page, "Closed");
  await page
    .getByLabel("Destination iteration", { exact: true })
    .selectOption("OMS");
  await page.getByRole("button", { name: "Review move", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Review move", exact: true }),
  ).toContainText("1 stories and 1 tasks will change");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("review-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Project to move stories").selectOption("p2");
  await expect(
    page.getByLabel("Select story #20: Platform story"),
  ).not.toBeChecked();
  await expect(page.getByText("0 selected", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Task statuses to move", exact: true }),
  ).toHaveText("None selected");
  await expect(
    page.getByLabel("Destination iteration", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("region", { name: "Review move", exact: true }),
  ).toHaveCount(0);
  expect(patches).toEqual([]);
  expect(errors).toEqual([]);
});
