import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { AuthSession } from "../features/auth/types";
import { AzureAuth } from "../features/auth/msal";
import { AzureRepository } from "../shared/api/azure";
import type { Settings, Repository, Metadata } from "../shared/api/types";
import { useStored } from "../shared/storage/storage";
const defaults: Settings = {
  mode: "azure",
  authMethod: "pat",
  organization: "",
  clientId: "",
  tenantId: "",
  project: "",
  team: "",
};
const valid = (x: unknown): x is Settings =>
  !!x &&
  typeof x === "object" &&
  ["demo", "azure"].includes((x as Settings).mode) &&
  ((x as Settings).authMethod === undefined ||
    ["pat", "microsoft"].includes((x as Settings).authMethod!)) &&
  ["organization", "clientId", "tenantId", "project", "team"].every(
    (k) => typeof (x as any)[k] === "string",
  );
interface Context {
  settings: Settings;
  setSettings: (s: Settings) => void;
  auth?: AuthSession;
  setPatSession: (a: AuthSession | undefined) => void;
  disconnect: () => Promise<void>;
  repo: Repository;
  creationRepo: Repository;
  creationMeta?: Metadata;
  creationLoading: boolean;
  creationError: Error | null;
  targetProject: string;
  setTargetProject: (id: string) => void;
  projects: import("../shared/api/types").Choice[];
  workProjects: import("../shared/api/types").Choice[];
  selectedWorkProjectIds: string[];
  setWorkProjectIds: (ids: string[]) => void;
  workQueryKey: string[];
  requestHours: () => void;
  hours: UseQueryResult<import("../shared/api/types").WorkItem[], Error>;
  hoursMeta?: Metadata;
  hoursError: Error | null;
  refreshHours: () => void;
  account: string;
  setAccount: (a: string) => void;
  scope: string;
  meta?: Metadata;
  work: UseQueryResult<import("../shared/api/types").WorkItem[], Error>;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  storageError: string;
}
const Context = createContext<Context | null>(null);
const disconnectedAuth: AuthSession = {
  authorizationHeader: async () => {
    throw new Error("Connect to Azure in Settings first.");
  },
  account: async () => undefined,
  logout: async () => {},
};
export function WorkspaceProvider({
  children,
  repositoryOverride,
}: {
  children: ReactNode;
  repositoryOverride?: Repository;
}) {
  // Test-only repositories are injected; the shipped app always uses Azure.
  const testRepository =
    import.meta.env.MODE === "test" ? repositoryOverride : undefined;
  const [storedSettings, setSettings, storageError] = useStored(
    "taskflow:v1:settings",
    testRepository ? { ...defaults, mode: "demo" as const } : defaults,
    valid,
  );
  const settings: Settings =
    !testRepository && storedSettings.mode === "demo"
      ? { ...storedSettings, mode: "azure" }
      : storedSettings;
  const [hoursScope, setHoursScope] = useState("");
  const [targetProject, setTargetProject] = useState("");
  const [account, setAccount] = useState("");
  const [patSession, setPatSession] = useState<AuthSession>();
  const queryClient = useQueryClient();
  const microsoftAuth = useMemo(
    () =>
      settings.authMethod !== "pat" && settings.clientId && settings.tenantId
        ? new AzureAuth(settings.clientId, settings.tenantId)
        : undefined,
    [settings.clientId, settings.tenantId, settings.authMethod],
  );
  const auth = settings.authMethod === "pat" ? patSession : microsoftAuth;
  const disconnect = async () => {
    await auth?.logout();
    setPatSession(undefined);
    setAccount("");
    setTargetProject("");
    queryClient.clear();
  };
  useEffect(() => {
    let active = true;
    if (auth && settings.mode === "azure")
      void auth
        .account()
        .then((a) => {
          if (active) setAccount(a?.username ?? "");
        })
        .catch(() => {
          if (active) setAccount("");
        });
    return () => {
      active = false;
    };
  }, [auth, settings.mode]);
  const repo = useMemo(
    () =>
      testRepository ??
      new AzureRepository(
        { ...settings, project: "", team: "" },
        auth ?? disconnectedAuth,
      ),
    [settings, auth, testRepository],
  );
  const scope =
    settings.mode === "demo"
      ? "demo"
      : `${account || "signed-out"}:${settings.organization}:all-projects`;
  const [projectSelections, setProjectSelections, selectionError] = useStored<
    Record<string, string[]>
  >(
    "taskflow:v1:work-project-selections",
    {},
    (value): value is Record<string, string[]> =>
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value).every(
        (ids) =>
          Array.isArray(ids) && ids.every((id) => typeof id === "string"),
      ),
  );
  const selectedWorkProjectIds = projectSelections[scope] ?? [];
  const enabled =
    settings.mode === "demo" || !!(auth && account && settings.organization);
  const projectQuery = useQuery({
    queryKey: ["projects", scope],
    queryFn: () => repo.projects(),
    enabled,
    retry: false,
  });
  const workProjects =
    settings.mode === "demo"
      ? (projectQuery.data ?? [])
      : (projectQuery.data ?? []).filter((p) =>
          selectedWorkProjectIds.includes(p.id),
        );
  const selectionKey = workProjects
    .map((p) => p.id)
    .sort()
    .join("|");
  const workQueryKey = ["work", scope, selectionKey];
  const hasWorkSelection = settings.mode === "demo" || workProjects.length > 0;
  const query = useQuery({
    queryKey: ["metadata", scope, selectionKey],
    queryFn: () => repo.workMetadata(workProjects),
    enabled: enabled && !!projectQuery.data && hasWorkSelection,
    retry: false,
  });
  const work = useQuery({
    queryKey: workQueryKey,
    queryFn: () => repo.listMine("all", query.data),
    enabled: enabled && hasWorkSelection && !!query.data,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const allMetadata = useQuery({
    queryKey: ["hours-metadata", scope],
    queryFn: () => repo.workMetadata(projectQuery.data!),
    enabled:
      enabled &&
      settings.mode === "azure" &&
      hoursScope === scope &&
      !!projectQuery.data,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const allHours = useQuery({
    queryKey: ["hours-work", scope],
    queryFn: () => repo.listMine("all", allMetadata.data),
    enabled:
      enabled &&
      settings.mode === "azure" &&
      hoursScope === scope &&
      !!allMetadata.data,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const teamQuery = useQuery({
    queryKey: ["default-team", scope, targetProject],
    queryFn: () => repo.defaultTeam(targetProject),
    enabled: enabled && !!targetProject,
    retry: false,
  });
  const creationRepo = useMemo(
    () =>
      testRepository ??
      new AzureRepository(
        { ...settings, project: targetProject, team: teamQuery.data?.id ?? "" },
        auth ?? disconnectedAuth,
      ),
    [settings, auth, targetProject, teamQuery.data?.id, testRepository],
  );
  const creation = useQuery({
    queryKey: ["creation-metadata", scope, targetProject, teamQuery.data?.id],
    queryFn: () => creationRepo.metadata(),
    enabled: enabled && !!targetProject && !!teamQuery.data,
    retry: false,
  });
  return (
    <Context.Provider
      value={{
        settings,
        setSettings,
        auth,
        setPatSession,
        disconnect,
        repo,
        creationRepo,
        creationMeta:
          targetProject && teamQuery.data ? creation.data : undefined,
        creationLoading:
          !!targetProject &&
          (teamQuery.isPending || (!!teamQuery.data && creation.isPending)),
        creationError: teamQuery.error ?? creation.error,
        targetProject,
        setTargetProject,
        projects: projectQuery.data ?? [],
        workProjects,
        selectedWorkProjectIds,
        setWorkProjectIds: (ids) =>
          setProjectSelections((previous) => ({
            ...previous,
            [scope]: [...new Set(ids)],
          })),
        workQueryKey,
        requestHours: () => setHoursScope(scope),
        hours: settings.mode === "demo" ? work : allHours,
        hoursMeta: settings.mode === "demo" ? query.data : allMetadata.data,
        hoursError:
          settings.mode === "demo"
            ? null
            : (projectQuery.error ?? allMetadata.error ?? allHours.error),
        refreshHours: () => {
          void (async () => {
            if (settings.mode === "demo") {
              await work.refetch();
              return;
            }
            const projects = await projectQuery.refetch();
            if (projects.error) return;
            const meta = await allMetadata.refetch();
            if (!meta.error) await allHours.refetch();
          })();
        },
        account,
        setAccount,
        scope,
        meta: enabled ? query.data : undefined,
        work,
        loading: projectQuery.isFetching || query.isFetching,
        error: projectQuery.error ?? query.error,
        refresh: () => {
          void (async () => {
            const projects = await projectQuery.refetch();
            if (projects.error) return;
            if (hasWorkSelection) {
              const metadata = await query.refetch();
              if (!metadata.error) await work.refetch();
            }
            if (targetProject) await creation.refetch();
          })();
        },
        storageError: storageError || selectionError,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Workspace provider missing");
  return context;
}
