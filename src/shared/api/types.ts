export type Mode = "demo" | "azure";
export interface Settings {
  authMethod?: "pat" | "microsoft";
  mode: Mode;
  organization: string;
  clientId: string;
  tenantId: string;
  project: string;
  team: string;
}
export interface Choice {
  id: string;
  name: string;
}
export interface Person extends Choice {
  identity: string;
}
export interface Iteration extends Choice {
  startDate?: string;
  finishDate?: string;
  project?: string;
  path: string;
  current?: boolean;
}
export interface ParentItem extends Choice {
  parentId?: string;
}
export interface ProjectWorkConfig {
  storyTypes?: string[];
  taskTypes?: string[];
  storyPointField?: string;
  storyStates?: string[];
  storyType: string;
  taskType: string;
  taskFields: string[];
  taskStates: string[];
  backlogPath: string;
}
export interface Metadata {
  storyPointField?: string;
  storyStates?: string[];
  projectConfigs?: Record<string, ProjectWorkConfig>;
  projects: Choice[];
  teams: Choice[];
  people: Person[];
  epics: ParentItem[];
  features: ParentItem[];
  iterations: Iteration[];
  backlogPath: string;
  areaPath: string;
  storyType: string;
  taskType: string;
  taskFields: string[];
  taskStates: string[];
  warnings: string[];
}
export interface WorkItem {
  project?: string;
  isTask?: boolean;
  isStory?: boolean;
  id: number;
  rev: number;
  title: string;
  type: string;
  state: string;
  assignedTo: string;
  iteration: string;
  parentId?: number;
  storyPoints?: number;
  storyPointField?: string;
  estimate?: number;
  remaining?: number;
  completed?: number;
  tags?: string;
  url?: string;
}
export interface WorkLoadProgress {
  project?: Choice;
  projectIndex: number;
  totalProjects: number;
  completedProjects: number;
  phase: "discovering" | "loading" | "linking" | "complete";
  /** Matching Azure records discovered for the project currently loading. */
  totalItems?: number;
  /** Matching Azure records fetched for the project currently loading. */
  loadedItems: number;
  /** Newly available story/task rows. Consumers should merge these by ID. */
  items: WorkItem[];
}
export type WorkLoadListener = (progress: WorkLoadProgress) => void;
export type Patch = { op: "add" | "test"; path: string; value: unknown }[];
export interface Repository {
  projects(): Promise<Choice[]>;
  teams(project: string): Promise<Choice[]>;
  metadata(): Promise<Metadata>;
  workMetadata(projects: Choice[]): Promise<Metadata>;
  defaultTeam(project: string): Promise<Choice>;
  listMine(
    assignee?: string,
    metadata?: Metadata,
    onProgress?: WorkLoadListener,
  ): Promise<WorkItem[]>;
  create(type: string, patch: Patch): Promise<WorkItem>;
  update(item: WorkItem, fields: Record<string, unknown>): Promise<WorkItem>;
  findByMarker(marker: string): Promise<WorkItem | undefined>;
  parentUrl(id: number): string;
}
export const fields = {
  estimate: "Microsoft.VSTS.Scheduling.OriginalEstimate",
  remaining: "Microsoft.VSTS.Scheduling.RemainingWork",
  completed: "Microsoft.VSTS.Scheduling.CompletedWork",
};

export const storyPointFields = [
  "Microsoft.VSTS.Scheduling.StoryPoints",
  "Microsoft.VSTS.Scheduling.Effort",
  "Microsoft.VSTS.Scheduling.Size",
];
