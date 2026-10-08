import { it, expect, vi, afterEach } from "vitest";
import { AzureRepository, ApiError } from "./azure";
import type { AuthSession } from "../../features/auth/types";
const settings = {
  mode: "azure" as const,
  organization: "company",
  project: "OMS",
  team: "OMS Team",
  tenantId: "tenant",
  clientId: "client",
};
const auth = {
  authorizationHeader: async () => "Bearer test-access-token",
} as AuthSession;
afterEach(() => vi.unstubAllGlobals());
it("sends authenticated JSON Patch to create a story", async () => {
  const fetcher = vi.fn(
    async (_url: string, _options: RequestInit) =>
      new Response(
        JSON.stringify({
          id: 99,
          rev: 1,
          fields: {
            "System.Title": "Story",
            "System.WorkItemType": "User Story",
            "System.State": "New",
            "System.IterationPath": "OMS",
          },
          relations: [
            {
              rel: "System.LinkTypes.Hierarchy-Reverse",
              url: "https://dev.azure.com/company/_apis/wit/workItems/120",
            },
          ],
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const repo = new AzureRepository(settings, auth);
  const result = await repo.create("User Story", [
    { op: "add", path: "/fields/System.Title", value: "Story" },
  ]);
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://dev.azure.com/company/OMS/_apis/wit/workitems/$User%20Story?api-version=7.1",
  );
  const options = fetcher.mock.calls[0][1];
  expect(options.method).toBe("POST");
  expect(options.headers).toMatchObject({
    Authorization: "Bearer test-access-token",
    "Content-Type": "application/json-patch+json",
  });
  expect(result.parentId).toBe(120);
});
it("maps permission errors and network failures for retry decisions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "Denied" }), { status: 403 }),
    ),
  );
  const repo = new AzureRepository(settings, auth);
  await expect(repo.create("Task", [])).rejects.toMatchObject({
    status: 403,
    message: "Denied",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  await expect(repo.create("Task", [])).rejects.toBeInstanceOf(ApiError);
  await expect(repo.create("Task", [])).rejects.toMatchObject({ status: 0 });
});

it("loads every project user page with project scope, deduplicates and excludes groups/deleted accounts", async () => {
  const fetcher = vi.fn(async (url: string, _options?: RequestInit) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/_apis/projects/OMS"))
      return new Response(JSON.stringify({ id: "project-guid" }));
    if (u.pathname.endsWith("/descriptors/project-guid"))
      return new Response(JSON.stringify({ value: "scp.project" }));
    if (u.pathname.endsWith("/graph/users")) {
      expect(u.searchParams.get("scopeDescriptor")).toBe("scp.project");
      expect(u.searchParams.get("api-version")).toBe("7.1-preview.1");
      if (!u.searchParams.has("continuationToken"))
        return new Response(
          JSON.stringify({
            value: [
              {
                descriptor: "aad.admin",
                principalName: "admin@example.com",
                displayName: "Admin",
                subjectKind: "user",
                origin: "aad",
              },
              {
                descriptor: "vssgp.group",
                principalName: "Contributors",
                subjectKind: "group",
              },
              {
                descriptor: "aad.deleted",
                principalName: "deleted@example.com",
                subjectKind: "user",
                isDeleted: true,
              },
            ],
          }),
          { headers: { "X-MS-ContinuationToken": "next+/=" } },
        );
      expect(u.searchParams.get("continuationToken")).toBe("next+/=");
      return new Response(
        JSON.stringify({
          value: [
            {
              descriptor: "aad.sara",
              principalName: "sara@example.com",
              displayName: "Sara from another team",
              subjectKind: "user",
              origin: "aad",
            },
            {
              descriptor: "aad.admin",
              principalName: "ADMIN@example.com",
              displayName: "Duplicate admin",
              subjectKind: "user",
              origin: "aad",
            },
            {
              descriptor: "svc.build",
              principalName: "Build service",
              subjectKind: "user",
              origin: "svc",
            },
          ],
        }),
      );
    }
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  const repo = new AzureRepository(settings, auth);
  expect(await repo.projectPeople()).toEqual([
    { id: "aad.admin", identity: "admin@example.com", name: "Admin" },
    {
      id: "aad.sara",
      identity: "sara@example.com",
      name: "Sara from another team",
    },
  ]);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(
    fetcher.mock.calls.every(
      ([, options]) =>
        (options?.headers as Record<string, string>).Authorization ===
        "Bearer test-access-token",
    ),
  ).toBe(true);
  expect(fetcher.mock.calls.some(([url]) => url.includes("/teams/"))).toBe(
    false,
  );
});

it("reports Graph permissions rather than falling back to team members or the token owner", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/descriptors/")
        ? new Response(JSON.stringify({ message: "Denied" }), { status: 403 })
        : new Response(JSON.stringify({ id: "project-guid" })),
    ),
  );
  await expect(
    new AzureRepository(settings, auth).projectPeople(),
  ).rejects.toMatchObject({
    status: 403,
    message: expect.stringContaining("Graph (Read)"),
  });
});

it("rejects repeated continuation tokens and malformed scope responses", async () => {
  const repo = new AzureRepository(settings, auth);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/descriptors/")
              ? { value: "scp.project" }
              : url.includes("/graph/users?")
                ? { value: [] }
                : { id: "project-guid" },
          ),
          {
            headers: url.includes("/graph/users?")
              ? { "X-MS-ContinuationToken": "repeated" }
              : {},
          },
        ),
    ),
  );
  await expect(repo.projectPeople()).rejects.toThrow(
    "repeated a project user pagination token",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/descriptors/") ? {} : { id: "project-guid" },
          ),
        ),
    ),
  );
  await expect(repo.projectPeople()).rejects.toThrow(
    "project scope descriptor",
  );
});

it("loads a task's parent story and every sibling including another assignee", async () => {
  const raw = (
    id: number,
    type: string,
    parent?: number,
    children: number[] = [],
  ) => ({
    id,
    rev: 1,
    fields: {
      "System.Title": `Item ${id}`,
      "System.WorkItemType": type,
      "System.State": "New",
      "System.AssignedTo": id === 2 ? "sara@example.com" : "ahmed@example.com",
      "System.IterationPath": "OMS",
    },
    relations: [
      ...(parent
        ? [
            {
              rel: "System.LinkTypes.Hierarchy-Reverse",
              url: `https://dev.azure.com/company/_apis/wit/workItems/${parent}`,
            },
          ]
        : []),
      ...children.map((child) => ({
        rel: "System.LinkTypes.Hierarchy-Forward",
        url: `https://dev.azure.com/company/_apis/wit/workItems/${child}`,
      })),
    ],
  });
  const all = [
    raw(1, "Task", 10),
    raw(10, "User Story", 120, [1, 2]),
    raw(2, "Task", 10),
  ];
  const fetcher = vi.fn(
    async (url: string, options: RequestInit) =>
      new Response(
        JSON.stringify(
          url.includes("/wiql?")
            ? { workItems: [{ id: 1 }] }
            : {
                value: all.filter((item) =>
                  JSON.parse(options.body as string).ids.includes(item.id),
                ),
              },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const items = await new AzureRepository(settings, auth).listMine();
  expect(items.map((i) => i.id)).toEqual([1, 10, 2]);
  expect(items.find((i) => i.id === 2)?.assignedTo).toBe("sara@example.com");
  expect(
    fetcher.mock.calls
      .filter(([url]) => url.includes("workitemsbatch"))
      .every(
        ([, options]) =>
          JSON.parse(options.body as string).$expand === "Relations",
      ),
  ).toBe(true);
});
it("reports discovery and each fetched work-item batch while loading", async () => {
  const events: import("./types").WorkLoadProgress[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes("/wiql"))
        return new Response(
          JSON.stringify({
            workItems: Array.from({ length: 201 }, (_, index) => ({
              id: index + 1,
            })),
          }),
        );
      const ids = JSON.parse(String(options.body)).ids as number[];
      return new Response(
        JSON.stringify({
          value: ids.map((id) => ({
            id,
            rev: 1,
            fields: {
              "System.Title": `Task ${id}`,
              "System.WorkItemType": "Task",
              "System.State": "New",
              "System.AssignedTo": "ahmed@example.com",
              "System.IterationPath": "OMS",
            },
          })),
        }),
      );
    }),
  );
  const items = await new AzureRepository(settings, auth).listMine(
    "all",
    undefined,
    (event) => events.push(event),
  );
  expect(items).toHaveLength(201);
  expect(events.map((event) => event.phase)).toEqual([
    "discovering",
    "loading",
    "loading",
    "loading",
    "complete",
  ]);
  expect(events[1]).toMatchObject({ totalItems: 201, loadedItems: 0 });
  expect(events[2]).toMatchObject({ loadedItems: 200 });
  expect(events[2].items).toHaveLength(200);
  expect(events[3]).toMatchObject({ loadedItems: 201 });
  expect(events[3].items).toHaveLength(1);
  expect(events[4]).toMatchObject({ totalItems: 201, loadedItems: 201 });
});
it("loads all project pages with encoded continuation tokens and deduplicates projects", async () => {
  const fetcher = vi.fn(async (url: string) => {
    const u = new URL(url);
    if (!u.searchParams.has("continuationToken"))
      return new Response(
        JSON.stringify({ value: [{ id: "p1", name: "Agile" }] }),
        {
          headers: { "X-MS-ContinuationToken": "next+/=" },
        },
      );
    expect(u.searchParams.get("continuationToken")).toBe("next+/=");
    return new Response(
      JSON.stringify({
        value: [
          { id: "p1", name: "Agile" },
          { id: "p2", name: "Scrum" },
        ],
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await new AzureRepository(settings, auth).projects()).toEqual([
    { id: "p1", name: "Agile" },
    { id: "p2", name: "Scrum" },
  ]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("pages organization work so all-user totals include more than the first 1,000 items", async () => {
  const queries: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (url.includes("/wiql")) {
        queries.push(body.query);
        const second = body.query.includes("[System.Id] > 1000");
        return new Response(
          JSON.stringify({
            workItems: second
              ? [{ id: 1001 }]
              : Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 })),
          }),
        );
      }
      return new Response(
        JSON.stringify({
          value: body.ids.map((id: number) => ({
            id,
            rev: 1,
            fields: {
              "System.Title": `Task ${id}`,
              "System.WorkItemType": "Task",
              "System.State": "Closed",
              "System.AssignedTo": "sara@example.com",
              "System.IterationPath": "OMS",
            },
          })),
        }),
      );
    }),
  );
  const result = await new AzureRepository(
    { ...settings, project: "" },
    auth,
  ).listMine("all");
  expect(result).toHaveLength(1001);
  expect(queries).toHaveLength(2);
  expect(
    queries.every(
      (q) =>
        !q.includes("System.AssignedTo") && !q.includes("System.TeamProject"),
    ),
  ).toBe(true);
  expect(queries[1]).toContain("[System.Id] > 1000");
});
it("escapes selected-user identities in WIQL", async () => {
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    expect(JSON.parse(String(options.body)).query).toContain(
      "[System.AssignedTo] = 'sara''s@example.com'",
    );
    return new Response(JSON.stringify({ workItems: [] }));
  });
  vi.stubGlobal("fetch", fetcher);
  expect(
    await new AzureRepository(settings, auth).listMine("sara's@example.com"),
  ).toEqual([]);
});

it("uses cached project metadata on a fresh client to retain Scrum backlog items and custom task types", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (url.includes("/wiql")) {
        expect(body.query).not.toContain("System.WorkItemType");
        return new Response(
          JSON.stringify({ workItems: [{ id: 1 }, { id: 2 }] }),
        );
      }
      return new Response(
        JSON.stringify({
          value: body.ids.map((id: number) => ({
            id,
            rev: 1,
            fields: {
              "System.TeamProject": "Scrum",
              "System.WorkItemType":
                id === 1 ? "Product Backlog Item" : "Engineering Task",
              "System.Title": `Item ${id}`,
              "System.State": "New",
              "System.IterationPath": "Scrum",
            },
          })),
        }),
      );
    }),
  );
  const metadata = {
    projects: [],
    teams: [],
    people: [],
    epics: [],
    features: [],
    iterations: [],
    backlogPath: "",
    areaPath: "",
    storyType: "Product Backlog Item",
    taskType: "Engineering Task",
    taskStates: ["New"],
    taskFields: [],
    warnings: [],
    projectConfigs: {
      Scrum: {
        storyType: "Product Backlog Item",
        taskType: "Engineering Task",
        taskFields: [],
        taskStates: ["New"],
        backlogPath: "Scrum",
      },
    },
  } as import("./types").Metadata;
  const items = await new AzureRepository(
    { ...settings, project: "" },
    auth,
  ).listMine("all", metadata);
  expect(items).toHaveLength(2);
  expect(items[0].isStory).toBe(true);
  expect(items[1].isTask).toBe(true);
});

it("reads every type in task and requirement categories, not just the defaults", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("workitemtypecategories"))
        return new Response(
          JSON.stringify({
            value: [
              {
                referenceName: "Microsoft.TaskCategory",
                defaultWorkItemType: { name: "Task" },
                workItemTypes: [{ name: "Task" }, { name: "Engineering Task" }],
              },
              {
                referenceName: "Microsoft.RequirementCategory",
                defaultWorkItemType: { name: "User Story" },
                workItemTypes: [{ name: "User Story" }, { name: "SRS Story" }],
              },
            ],
          }),
        );
      if (url.includes("workitemtypes/"))
        return new Response(
          JSON.stringify({ fields: [], states: [{ name: "New" }] }),
        );
      return new Response(
        JSON.stringify({ message: "optional metadata denied" }),
        { status: 403 },
      );
    }),
  );
  const metadata = await new AzureRepository(
    { ...settings, project: "" },
    auth,
  ).workMetadata([{ id: "p1", name: "OMS" }]);
  expect(metadata.projectConfigs?.OMS.taskTypes).toEqual([
    "Task",
    "Engineering Task",
  ]);
  expect(metadata.projectConfigs?.OMS.storyTypes).toEqual([
    "User Story",
    "SRS Story",
  ]);
});
it("queries every project directly with progress and includes non-default types", async () => {
  const queried: string[] = [];
  const progress: import("./types").WorkLoadProgress[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (url.includes("/wiql")) {
        queried.push(url);
        expect(body.query).toContain("[System.TeamProject] = @project");
        expect(body.query).not.toMatch(
          /System.AssignedTo|System.State|System.IterationPath|System.WorkItemType/,
        );
        return new Response(
          JSON.stringify({ workItems: [{ id: url.includes("/p1/") ? 1 : 2 }] }),
        );
      }
      return new Response(
        JSON.stringify({
          value: body.ids.map((id: number) => ({
            id,
            rev: 1,
            fields: {
              "System.TeamProject": id === 1 ? "OMS" : "Platform",
              "System.WorkItemType":
                id === 1 ? "SRS Story" : "Engineering Task",
              "System.Title": `Item ${id}`,
              "System.State": "New",
              "System.IterationPath": "Any sprint",
              "System.AssignedTo": "another-user@example.com",
            },
          })),
        }),
      );
    }),
  );
  const config = {
    storyType: "User Story",
    taskType: "Task",
    storyTypes: ["User Story", "SRS Story"],
    taskTypes: ["Task", "Engineering Task"],
    taskFields: [],
    taskStates: ["New"],
    backlogPath: "",
  };
  const metadata: import("./types").Metadata = {
    projects: [
      { id: "p1", name: "OMS" },
      { id: "p2", name: "Platform" },
    ],
    teams: [],
    people: [],
    epics: [],
    features: [],
    iterations: [],
    backlogPath: "",
    areaPath: "",
    storyType: "User Story",
    taskType: "Task",
    taskFields: [],
    taskStates: ["New"],
    warnings: [],
    projectConfigs: { OMS: config, Platform: config },
  };
  const items = await new AzureRepository(
    { ...settings, project: "" },
    auth,
  ).listMine("all", metadata, (event) => progress.push(event));
  expect(queried).toHaveLength(2);
  expect(queried[0]).toContain("/company/p1/_apis/wit/wiql");
  expect(queried[1]).toContain("/company/p2/_apis/wit/wiql");
  expect(items.map((i) => i.id)).toEqual([1, 2]);
  expect(items[0].isStory).toBe(true);
  expect(items[1].isTask).toBe(true);
  expect(
    progress
      .filter((event) => event.phase === "complete")
      .map((event) => [event.project?.name, event.completedProjects]),
  ).toEqual([
    ["OMS", 1],
    ["Platform", 2],
  ]);
});
