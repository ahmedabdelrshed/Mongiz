import type { AuthSession } from "../../features/auth/types";
import {
  fields,
  storyPointFields,
  type Choice,
  type Metadata,
  type Patch,
  type Person,
  type ProjectWorkConfig,
  type Repository,
  type Settings,
  type WorkLoadListener,
  type WorkItem,
} from "./types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
interface RawItem {
  id: number;
  rev: number;
  fields: Record<string, any>;
  relations?: { rel: string; url: string }[];
  _links?: { html?: { href: string } };
}
function mapped(x: RawItem): WorkItem {
  const f = x.fields,
    parent = x.relations?.find(
      (r) => r.rel === "System.LinkTypes.Hierarchy-Reverse",
    );
  return {
    project: f["System.TeamProject"],
    storyPointField: storyPointFields.find((key) => f[key] !== undefined),
    storyPoints: storyPointFields
      .map((key) => f[key])
      .find((value) => value !== undefined),
    id: x.id,
    rev: x.rev,
    title: f["System.Title"] ?? "",
    type: f["System.WorkItemType"],
    state: f["System.State"],
    assignedTo:
      typeof f["System.AssignedTo"] === "string"
        ? f["System.AssignedTo"]
        : (f["System.AssignedTo"]?.uniqueName ?? ""),
    iteration: f["System.IterationPath"],
    parentId: parent ? Number(parent.url.split("/").pop()) : undefined,
    estimate: f[fields.estimate],
    remaining: f[fields.remaining],
    completed: f[fields.completed],
    tags: f["System.Tags"],
    url: x._links?.html?.href,
  };
}
const escape = (s: string) => s.replace(/'/g, "''");
export class AzureRepository implements Repository {
  private base: string;
  private project: string;
  private team: string;
  private configs: Record<string, ProjectWorkConfig> = {};
  private taskType = "Task";
  private storyType = "User Story";
  constructor(
    private settings: Settings,
    private auth: AuthSession,
  ) {
    this.base = `https://dev.azure.com/${encodeURIComponent(settings.organization)}`;
    this.project = encodeURIComponent(settings.project);
    this.team = encodeURIComponent(settings.team);
  }
  parentUrl(id: number) {
    return `${this.base}/_apis/wit/workItems/${id}`;
  }
  private async response(
    path: string,
    method = "GET",
    body?: unknown,
    patch = false,
    base = this.base,
    version = "7.1",
  ): Promise<Response> {
    const authorization = await this.auth.authorizationHeader();
    let response: Response;
    try {
      response = await fetch(
        `${base}/${path.replace(/^\/+/, "")}${path.includes("?") ? "&" : "?"}api-version=${version}`,
        {
          method,
          headers: {
            Authorization: authorization,
            ...(body
              ? {
                  "Content-Type": patch
                    ? "application/json-patch+json"
                    : "application/json",
                }
              : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
    } catch {
      throw new ApiError(
        "Network or browser CORS error. Check the connection and API access.",
        0,
      );
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(
        error.message ?? `Azure request failed (${response.status}).`,
        response.status,
      );
    }
    return response;
  }
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    patch = false,
  ): Promise<T> {
    return (
      await this.response(path, method, body, patch)
    ).json() as Promise<T>;
  }
  async projects() {
    const projects = new Map<string, Choice>();
    const seen = new Set<string>();
    let continuation = "";
    do {
      const params = new URLSearchParams({ $top: "1000" });
      if (continuation) params.set("continuationToken", continuation);
      const response = await this.response(`_apis/projects?${params}`);
      const page = (await response.json()) as { value: Choice[] };
      for (const project of page.value)
        projects.set(project.id, { id: project.id, name: project.name });
      continuation =
        response.headers.get("X-MS-ContinuationToken")?.trim() ?? "";
      if (continuation && seen.has(continuation))
        throw new Error(
          "Azure repeated a project pagination token. Retry connecting.",
        );
      if (continuation) seen.add(continuation);
    } while (continuation);
    return [...projects.values()];
  }
  async teams(project: string) {
    const r = await this.request<{ value: Choice[] }>(
      `_apis/projects/${encodeURIComponent(project)}/teams?$top=1000`,
    );
    return r.value;
  }
  async defaultTeam(project: string): Promise<Choice> {
    const detail = await this.request<{ defaultTeam?: Choice }>(
      `_apis/projects/${encodeURIComponent(project)}`,
    );
    if (!detail.defaultTeam?.id)
      throw new Error(
        "This project has no accessible default team. Ask the project administrator to configure one.",
      );
    return detail.defaultTeam;
  }
  async workMetadata(projects: Choice[]): Promise<Metadata> {
    const people = new Map<string, Person>();
    const configs: Record<string, ProjectWorkConfig> = {};
    const iterations: Metadata["iterations"] = [];
    const warnings: string[] = [];
    for (let offset = 0; offset < projects.length; offset += 6) {
      const batch = projects.slice(offset, offset + 6);
      const results = await Promise.allSettled(
        batch.map(async (project) => {
          const repo = new AzureRepository(
            { ...this.settings, project: project.id },
            this.auth,
          );
          const categories = await repo.request<{
            value: {
              referenceName: string;
              defaultWorkItemType: { name: string };
              workItemTypes?: { name: string }[];
            }[];
          }>(
            `${encodeURIComponent(project.id)}/_apis/wit/workitemtypecategories`,
          );
          const category = (ref: string) =>
            categories.value.find((c) => c.referenceName === ref)
              ?.defaultWorkItemType.name;
          const taskType = category("Microsoft.TaskCategory"),
            storyType = category("Microsoft.RequirementCategory");
          if (!taskType || !storyType)
            throw new Error("No task or requirement type is configured.");
          const detail = await repo.request<{
            fields: { referenceName: string }[];
            states: { name: string }[];
          }>(
            `${encodeURIComponent(project.id)}/_apis/wit/workitemtypes/${encodeURIComponent(taskType)}`,
          );
          const storyDetail = await repo.request<{
            fields: { referenceName: string }[];
            states: { name: string }[];
          }>(
            `${encodeURIComponent(project.id)}/_apis/wit/workitemtypes/${encodeURIComponent(storyType)}`,
          );
          const categoryTypes = (ref: string, fallback: string) => [
            ...new Set([
              fallback,
              ...(categories.value
                .find((c) => c.referenceName === ref)
                ?.workItemTypes?.map((t) => t.name) ?? []),
            ]),
          ];
          const config: ProjectWorkConfig = {
            storyTypes: categoryTypes(
              "Microsoft.RequirementCategory",
              storyType,
            ),
            taskTypes: categoryTypes("Microsoft.TaskCategory", taskType),
            storyPointField: storyPointFields.find((key) =>
              storyDetail.fields.some((f) => f.referenceName === key),
            ),
            storyStates: storyDetail.states.map((s) => s.name),
            taskType,
            storyType,
            taskFields: detail.fields.map((f) => f.referenceName),
            taskStates: detail.states.map((s) => s.name),
            backlogPath: "",
          };
          configs[project.name] = configs[project.id] = config;
          const optional = await Promise.allSettled([
            repo.projectPeople(),
            (async () => {
              const team = await repo.defaultTeam(project.id);
              const path = `${encodeURIComponent(project.id)}/${encodeURIComponent(team.id)}/_apis/work/teamsettings`;
              const settings = await repo.request<{
                backlogIteration: { path: string };
              }>(path);
              config.backlogPath = settings.backlogIteration.path;
              const sprints = await repo.request<{
                value: {
                  id: string;
                  name: string;
                  path: string;
                  attributes: {
                    timeFrame: string;
                    startDate?: string;
                    finishDate?: string;
                  };
                }[];
              }>(`${path}/iterations`);
              iterations.push(
                ...sprints.value.map((s) => ({
                  id: s.id,
                  name: s.name,
                  path: s.path,
                  current: s.attributes.timeFrame === "current",
                  startDate: s.attributes.startDate,
                  finishDate: s.attributes.finishDate,
                  project: project.name,
                })),
              );
            })(),
          ]);
          const users = optional[0];
          if (users.status === "fulfilled")
            for (const user of users.value as Person[])
              people.set(user.identity.toLowerCase(), user);
          else
            warnings.push(
              `${project.name}: ${(users.reason as Error).message}`,
            );
          if (optional[1].status === "rejected")
            warnings.push(
              `${project.name}: sprint filters unavailable. ${(optional[1].reason as Error).message}`,
            );
        }),
      );
      results.forEach((result, index) => {
        if (result.status === "rejected")
          warnings.push(
            `${batch[index].name}: ${(result.reason as Error).message}`,
          );
      });
    }
    this.configs = configs;
    const values = Object.values(configs);
    if (projects.length && !values.length)
      throw new Error(
        `Could not load work-item types for any project. ${warnings.join(" · ")}`,
      );
    return {
      projects,
      teams: [],
      people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
      projectConfigs: configs,
      epics: [],
      features: [],
      iterations,
      backlogPath: "",
      areaPath: "",
      storyStates: [...new Set(values.flatMap((c) => c.storyStates ?? []))],
      storyType: values[0]?.storyType ?? "User Story",
      taskType: values[0]?.taskType ?? "Task",
      taskFields: [...new Set(values.flatMap((c) => c.taskFields))],
      taskStates: [...new Set(values.flatMap((c) => c.taskStates))],
      warnings,
    };
  }
  /** Project-scoped Graph users, including users outside the selected team. */
  async projectPeople(): Promise<Person[]> {
    const project = await this.request<{ id: string }>(
      `_apis/projects/${this.project}`,
    );
    if (!project.id)
      throw new Error("Azure did not return the selected project's ID.");
    const graphBase = `https://vssps.dev.azure.com/${encodeURIComponent(this.settings.organization)}`;
    try {
      const descriptor = (await (
        await this.response(
          `_apis/graph/descriptors/${encodeURIComponent(project.id)}`,
          "GET",
          undefined,
          false,
          graphBase,
        )
      ).json()) as { value: string };
      if (!descriptor.value)
        throw new Error("Azure did not return the project scope descriptor.");
      const people = new Map<string, Person>();
      const seenTokens = new Set<string>();
      let continuation = "";
      do {
        const params = new URLSearchParams({
          scopeDescriptor: descriptor.value,
        });
        if (continuation) params.set("continuationToken", continuation);
        const response = await this.response(
          `_apis/graph/users?${params}`,
          "GET",
          undefined,
          false,
          graphBase,
          "7.1-preview.1",
        );
        const page = (await response.json()) as {
          value: {
            descriptor: string;
            principalName?: string;
            mailAddress?: string;
            displayName?: string;
            subjectKind?: string;
            origin?: string;
            isDeleted?: boolean;
          }[];
        };
        if (!Array.isArray(page.value))
          throw new Error("Azure returned an invalid project user list.");
        for (const user of page.value) {
          const identity = (
            user.principalName ||
            user.mailAddress ||
            ""
          ).trim();
          if (
            !identity ||
            user.isDeleted ||
            user.subjectKind !== "user" ||
            ["svc", "vsts"].includes(user.origin ?? "")
          )
            continue;
          const key = identity.toLowerCase();
          if (!people.has(key))
            people.set(key, {
              id: user.descriptor,
              name: user.displayName || identity,
              identity,
            });
        }
        continuation =
          response.headers.get("X-MS-ContinuationToken")?.trim() ?? "";
        if (continuation && seenTokens.has(continuation))
          throw new Error(
            "Azure repeated a project user pagination token. Retry loading the workspace.",
          );
        if (continuation) seenTokens.add(continuation);
      } while (continuation);
      return [...people.values()].sort(
        (a, b) =>
          a.name.localeCompare(b.name) || a.identity.localeCompare(b.identity),
      );
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403))
        throw new ApiError(
          "Cannot load project users. Enable Graph (Read) on your Azure DevOps PAT, verify project access, then reconnect in Settings.",
          e.status,
        );
      throw e;
    }
  }
  private async queryIds(query: string): Promise<{ id: number }[]> {
    const r = await this.request<{ workItems: { id: number }[] }>(
      `${this.project ? this.project + "/" : ""}_apis/wit/wiql?$top=1000`,
      "POST",
      { query },
    );
    return r.workItems;
  }
  private async query(query: string): Promise<RawItem[]> {
    return this.itemsByIds((await this.queryIds(query)).map((item) => item.id));
  }
  async metadata(): Promise<Metadata> {
    const teamPath = `${this.project}/${this.team}/_apis/work/teamsettings`;
    const [categories, types, teamSettings, iterations, teamField, people] =
      await Promise.all([
        this.request<{
          value: {
            referenceName: string;
            defaultWorkItemType: { name: string };
          }[];
        }>(`${this.project}/_apis/wit/workitemtypecategories`),
        this.request<{ value: { name: string }[] }>(
          `${this.project}/_apis/wit/workitemtypes`,
        ),
        this.request<{ backlogIteration: { path: string } }>(teamPath),
        this.request<{
          value: {
            id: string;
            name: string;
            path: string;
            attributes: {
              timeFrame: string;
              startDate?: string;
              finishDate?: string;
            };
          }[];
        }>(`${teamPath}/iterations`),
        this.request<{ defaultValue: string }>(`${teamPath}/teamfieldvalues`),
        this.projectPeople(),
      ]);
    const category = (ref: string) =>
      categories.value.find((c) => c.referenceName === ref)?.defaultWorkItemType
        .name;
    const storyType = category("Microsoft.RequirementCategory");
    const taskType = category("Microsoft.TaskCategory");
    if (taskType) this.taskType = taskType;
    if (storyType) this.storyType = storyType;
    const epicType = category("Microsoft.EpicCategory");
    const featureType = category("Microsoft.FeatureCategory");
    if (!storyType || !taskType)
      throw new Error(
        "This project needs requirement and task work-item types.",
      );
    if (!epicType || !featureType)
      throw new Error(
        "This project does not expose Epic → Feature hierarchy. Use an Agile, Scrum, CMMI or customized process with portfolio levels.",
      );
    const [parents, taskDetail, storyDetail] = await Promise.all([
      this.query(
        `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] IN ('${escape(epicType)}','${escape(featureType)}') ORDER BY [System.Title]`,
      ),
      this.request<{
        fields: { referenceName: string }[];
        states: { name: string }[];
      }>(
        `${this.project}/_apis/wit/workitemtypes/${encodeURIComponent(taskType)}`,
      ),
      this.request<{
        fields: { referenceName: string }[];
        states: { name: string }[];
      }>(
        `${this.project}/_apis/wit/workitemtypes/${encodeURIComponent(storyType)}`,
      ),
    ]);
    const choices = (type: string) =>
      parents
        .filter((i) => i.fields["System.WorkItemType"] === type)
        .map((i) => ({
          id: String(i.id),
          name: i.fields["System.Title"],
          parentId: String(mapped(i).parentId ?? ""),
        }));
    return {
      projects: [],
      teams: [],
      people,
      epics: choices(epicType),
      features: choices(featureType),
      iterations: iterations.value.map((i) => ({
        id: i.id,
        name: i.name,
        path: i.path,
        current: i.attributes.timeFrame === "current",
        startDate: i.attributes.startDate,
        finishDate: i.attributes.finishDate,
      })),
      backlogPath: teamSettings.backlogIteration.path,
      areaPath: teamField.defaultValue,
      storyType,
      taskType,
      storyPointField: storyPointFields.find((key) =>
        storyDetail.fields.some((f) => f.referenceName === key),
      ),
      storyStates: storyDetail.states.map((s) => s.name),
      taskFields: taskDetail.fields.map((f) => f.referenceName),
      taskStates: taskDetail.states.map((s) => s.name),
      warnings: [
        ...(!people.length
          ? [
              "Azure returned no assignable users for this project. Check project membership and Graph access.",
            ]
          : []),
        ...(parents.length === 1000
          ? ["Only the first 1,000 portfolio items are shown."]
          : []),
        ...(!types.value.some((t) => t.name === "User Story")
          ? [`This process uses “${storyType}” for stories.`]
          : []),
      ],
    };
  }
  private async itemsByIds(ids: number[]): Promise<RawItem[]> {
    const items: RawItem[] = [];
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 200) {
      const batch = await this.request<{ value: RawItem[] }>(
        `${this.project ? this.project + "/" : ""}_apis/wit/workitemsbatch`,
        "POST",
        { ids: unique.slice(i, i + 200), $expand: "Relations" },
      );
      items.push(...batch.value);
    }
    return items;
  }
  async listMine(
    assignee?: string,
    metadata?: Metadata,
    onProgress?: WorkLoadListener,
  ) {
    const configs = metadata?.projectConfigs ?? this.configs;
    // Query explicit project contexts. Do not depend on organization-level WIQL
    // or restrict Azure results to only each category's default type.
    if (!this.settings.project && metadata?.projects.length) {
      const all = new Map<number, WorkItem>();
      let completedProjects = 0;
      for (const [projectIndex, project] of metadata.projects.entries()) {
        let totalItems: number | undefined;
        let loadedItems = 0;
        const repo = new AzureRepository(
          { ...this.settings, project: project.id, team: "" },
          this.auth,
        );
        try {
          const projectItems = await repo.listMine(
            assignee,
            metadata,
            (progress) => {
              totalItems = progress.totalItems;
              loadedItems = progress.loadedItems;
              if (progress.phase === "complete") return;
              onProgress?.({
                ...progress,
                project,
                projectIndex,
                totalProjects: metadata.projects.length,
                completedProjects,
              });
            },
          );
          for (const item of projectItems) all.set(item.id, item);
          completedProjects++;
          onProgress?.({
            project,
            projectIndex,
            totalProjects: metadata.projects.length,
            completedProjects,
            phase: "complete",
            totalItems,
            loadedItems,
            items: [],
          });
        } catch (error) {
          throw new Error(
            `${project.name}: work-item loading failed. ${(error as Error).message}`,
          );
        }
      }
      return [...all.values()];
    }
    const project = metadata?.projects.find(
      (candidate) =>
        candidate.id === this.settings.project ||
        candidate.name === this.settings.project,
    );
    const report = (
      phase: "discovering" | "loading" | "linking" | "complete",
      totalItems: number | undefined,
      loadedItems: number,
      items: WorkItem[] = [],
    ) =>
      onProgress?.({
        project,
        projectIndex: 0,
        totalProjects: 1,
        completedProjects: phase === "complete" ? 1 : 0,
        phase,
        totalItems,
        loadedItems,
        items,
      });
    report("discovering", undefined, 0);
    const clauses = [
      this.settings.project ? "[System.TeamProject] = @project" : "",
      assignee === "all"
        ? ""
        : assignee
          ? `[System.AssignedTo] = '${escape(assignee)}'`
          : "[System.AssignedTo] = @Me",
    ].filter(Boolean);
    const ids: number[] = [];
    let after = 0;
    while (true) {
      const conditions = [...clauses, `[System.Id] > ${after}`];
      const page = await this.queryIds(
        `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(" AND ")} ORDER BY [System.Id] ASC`,
      );
      ids.push(...page.map((item) => item.id));
      if (page.length < 1000) break;
      const last = Math.max(...page.map((item) => item.id));
      if (last <= after)
        throw new Error(
          "Azure returned a repeated work-item page. Retry loading.",
        );
      after = last;
    }
    const uniqueIds = [...new Set(ids)];
    report("loading", uniqueIds.length, 0);
    const configFor = (x: RawItem) => {
      const name = String(
        x.fields["System.TeamProject"] ?? this.settings.project,
      );
      return (
        configs[name] ??
        Object.entries(configs).find(
          ([key]) => key.toLowerCase() === name.toLowerCase(),
        )?.[1]
      );
    };
    const isTask = (x: RawItem) => {
      const config = configFor(x);
      return (
        config?.taskTypes ?? [config?.taskType ?? this.taskType]
      ).includes(x.fields["System.WorkItemType"]);
    };
    const isStory = (x: RawItem) => {
      const config = configFor(x);
      return (
        config?.storyTypes ?? [config?.storyType ?? this.storyType]
      ).includes(x.fields["System.WorkItemType"]);
    };
    const asWorkItem = (item: RawItem): WorkItem => {
      const mappedItem = mapped(item);
      return {
        ...mappedItem,
        storyPointField:
          configFor(item)?.storyPointField ?? mappedItem.storyPointField,
        isStory: isStory(item),
        isTask: isTask(item),
      };
    };
    const known = new Map<number, RawItem>();
    const addedWorkItems = (items: RawItem[]) =>
      items
        .filter((item) => (isStory(item) || isTask(item)) && !known.has(item.id))
        .map(asWorkItem);
    const assigned: RawItem[] = [];
    let loadedItems = 0;
    for (let offset = 0; offset < uniqueIds.length; offset += 200) {
      const chunk = uniqueIds.slice(offset, offset + 200);
      const batch = await this.itemsByIds(chunk);
      const next = addedWorkItems(batch);
      for (const item of batch) known.set(item.id, item);
      assigned.push(...batch);
      loadedItems += chunk.length;
      report("loading", uniqueIds.length, loadedItems, next);
    }
    if (assigned.length && !assigned.some((x) => isTask(x) || isStory(x))) {
      const types = [
        ...new Set(assigned.map((x) => x.fields["System.WorkItemType"])),
      ].join(", ");
      // Portfolio-only projects legitimately contain no stories/tasks.
      if (
        assigned.some(
          (x) =>
            ![
              "Epic",
              "Feature",
              "Bug",
              "Test Case",
              "Test Suite",
              "Test Plan",
              "Shared Steps",
              "Shared Parameter",
              "Code Review Request",
              "Code Review Response",
              "Feedback Request",
              "Feedback Response",
            ].includes(x.fields["System.WorkItemType"]),
        )
      )
        throw new Error(
          `Azure returned ${assigned.length} items but none matched the configured story/task categories. Returned types: ${types}. Refresh project metadata in Settings.`,
        );
    }
    const parentIds = assigned
      .filter(isTask)
      .map((x) => mapped(x).parentId)
      .filter((id): id is number => !!id && !known.has(id));
    const addRelated = async (
      relatedIds: number[],
      keep: (item: RawItem) => boolean = () => true,
    ) => {
      const unique = [...new Set(relatedIds)];
      for (let offset = 0; offset < unique.length; offset += 200) {
        const batch = await this.itemsByIds(unique.slice(offset, offset + 200));
        const accepted = batch.filter((item) => keep(item));
        const next = addedWorkItems(accepted);
        for (const item of accepted) known.set(item.id, item);
        report("linking", uniqueIds.length, loadedItems, next);
      }
    };
    await addRelated(parentIds);
    const stories = [...known.values()].filter(isStory);
    const children = stories
      .flatMap(
        (x) =>
          x.relations
            ?.filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
            .map((r) => Number(r.url.split("/").pop())) ?? [],
      )
      .filter((id) => Number.isFinite(id) && !known.has(id));
    await addRelated(children, isTask);
    const allowedProjects = new Set(
      metadata?.projects.map((p) => p.name.toLowerCase()) ?? [],
    );
    const result = [...known.values()]
      .filter(
        (x) =>
          !allowedProjects.size ||
          allowedProjects.has(
            String(x.fields["System.TeamProject"] ?? "").toLowerCase(),
          ),
      )
      .filter((x) => isStory(x) || isTask(x))
      .map(asWorkItem);
    report("complete", uniqueIds.length, loadedItems);
    return result;
  }
  async create(type: string, patch: Patch) {
    return mapped(
      await this.request<RawItem>(
        `${this.project}/_apis/wit/workitems/$${encodeURIComponent(type)}`,
        "POST",
        patch,
        true,
      ),
    );
  }
  async update(item: WorkItem, values: Record<string, unknown>) {
    const patch: Patch = [
      { op: "test", path: "/rev", value: item.rev },
      ...Object.entries(values).map(([name, value]) => ({
        op: "add" as const,
        path: `/fields/${name}`,
        value,
      })),
    ];
    return mapped(
      await this.request<RawItem>(
        `${this.project}/_apis/wit/workitems/${item.id}`,
        "PATCH",
        patch,
        true,
      ),
    );
  }
  async findByMarker(marker: string) {
    const items = await this.query(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Tags] CONTAINS '${escape(marker)}'`,
    );
    return items.map(mapped).find((x) =>
      x.tags
        ?.split(";")
        .map((t) => t.trim())
        .includes(marker),
    );
  }
}
