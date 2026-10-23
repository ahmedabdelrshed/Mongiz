import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  RefreshCw,
  ExternalLink,
  Save,
  Pencil,
  Download,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../../app/Workspace";
import {
  fields,
  isIterationCurrent,
  type WorkItem,
  type WorkLoadProgress,
} from "../../shared/api/types";
import { Empty, Loading, Notice, PageTitle } from "../../shared/ui/Common";
import { SearchableMultiSelect } from "../../shared/ui/SearchableMultiSelect";
import { Modal } from "../../shared/ui/Dialog";
import {
  AnimatedSection,
  Disclosure,
  fade,
  useCompactLayout,
} from "../../shared/ui/Motion";
import { storageKey, useStored } from "../../shared/storage/storage";
import { ProjectPicker } from "./ProjectPicker";
import { VirtualWorkList } from "./VirtualWorkList";
import { HoursPanel } from "./HoursPanel";
import {
  DEFAULT_SPRINT_TARGET,
  isSprintTarget,
  owns,
  sprintMatches,
  uniqueSprints,
  type SprintTarget,
} from "./filters";
import { groupWorkItems } from "./workGroups";
import {
  fillSprintHours,
  hourCategories,
  type HourCategory,
} from "./fillSprintHours";
import { planKey, validIds } from "../daily-plan/model";
import {
  BULK_ESTIMATE_EXCLUDED_HOURS,
  canBulkEstimate,
  effective,
  isEdits,
  patchValues,
  stage,
  stageState,
  type Edits,
} from "./edits";
interface DraftProps {
  edits: Edits;
  setEdits: (value: Edits | ((previous: Edits) => Edits)) => void;
  editError: string;
}
export function MyWorkPage({ today = false }: { today?: boolean }) {
  const w = useWorkspace();
  return <WorkPage key={w.scope + (today ? "today" : "work")} today={today} />;
}
function WorkPage({ today }: { today: boolean }) {
  const w = useWorkspace();
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [target, setTarget, targetError] = useStored(
    storageKey(w.scope, "sprint-target"),
    DEFAULT_SPRINT_TARGET,
    isSprintTarget,
  );
  const [edits, setEdits, editError] = useStored<Edits>(
    storageKey(w.scope, "work-edits"),
    {},
    isEdits,
  );
  return (
    <>
      <PageTitle
        title={today ? "Today’s plan" : "My work"}
        subtitle={
          today
            ? new Date().toLocaleDateString("en", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })
            : "Your stories and tasks, with room to focus. Changes stay local until you save."
        }
        action={<div ref={setActionsTarget} />}
      />
      {targetError && <Notice tone="error">{targetError}</Notice>}
      {!today && (
        <HoursPanel edits={edits} target={target} setTarget={setTarget} />
      )}
      <WorkList
        actionsTarget={actionsTarget}
        key={w.workQueryKey.join(":")}
        today={today}
        target={target}
        edits={edits}
        setEdits={setEdits}
        editError={editError}
      />
    </>
  );
}
function WorkLoadPanel({
  progress,
  loading,
  failed,
  stories,
  tasks,
}: {
  progress?: WorkLoadProgress;
  loading: boolean;
  failed: boolean;
  stories: number;
  tasks: number;
}) {
  const totalProjects = progress?.totalProjects ?? 1;
  const totalItems = progress?.totalItems;
  const itemFraction = totalItems
    ? (progress?.loadedItems ?? 0) / totalItems
    : 0;
  const projectValue = Math.min(
    totalProjects,
    (progress?.completedProjects ?? 0) + itemFraction,
  );
  const itemValue = Math.min(progress?.loadedItems ?? 0, totalItems ?? 0);
  const projectName = progress?.project?.name ?? "selected project";
  return (
    <section
      className="work-load-progress"
      aria-label="Work item loading progress"
      aria-live="polite"
    >
      <div className="work-load-progress-heading">
        <strong>
          {failed
            ? "Loading stopped"
            : loading
              ? "Loading stories and tasks"
              : "Loading status"}
        </strong>
        <span>
          {progress?.completedProjects ?? 0} of {totalProjects} projects
          complete
        </span>
      </div>
      <progress
        aria-label="Selected projects progress"
        max={totalProjects}
        value={projectValue}
      />
      {totalItems === undefined ? (
        <p className="muted">Finding matching work items in {projectName}…</p>
      ) : totalItems > 0 ? (
        <>
          <div className="work-load-progress-heading">
            <span>{projectName}</span>
            <span>
              {itemValue} of {totalItems} Azure items fetched
            </span>
          </div>
          <progress
            aria-label="Current project items progress"
            max={totalItems}
            value={itemValue}
          />
          <p className="muted">
            {Math.max(totalItems - itemValue, 0)} Azure items remaining in this
            project.
          </p>
        </>
      ) : (
        <p className="muted">No matching Azure items found in {projectName}.</p>
      )}
      <p className="muted">
        Available so far: {tasks} tasks and {stories} stories.
      </p>
    </section>
  );
}
function WorkList({
  actionsTarget,
  today,
  target,
  edits,
  setEdits,
  editError,
}: {
  today: boolean;
  target: SprintTarget;
  actionsTarget: HTMLDivElement | null;
} & DraftProps) {
  const w = useWorkspace(),
    client = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedHourCategories, setSelectedHourCategories] = useState<
    HourCategory[]
  >(["auto"]);
  const [exporting, setExporting] = useState(false);
  const [statuses, setStatuses] = useState(["all"]);
  const [destinations, setDestinations] = useState(["current"]);
  const [selectedUsers, setSelectedUsers] = useState(["mine"]);
  const owner = w.settings.mode === "demo" ? "ahmed@example.com" : w.account;
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number[]>([]),
    [bulkAssignee, setBulkAssignee] = useState("__keep");
  const [project, setProject] = useState("");
  const [taskState, setTaskState] = useState("");
  const [storyState, setStoryState] = useState("");
  const [bulkEstimate, setBulkEstimate] = useState("");
  const [bulkPoints, setBulkPoints] = useState("");
  const [titleEditor, setTitleEditor] = useState<WorkItem | null>(null);
  const [taskEditorId, setTaskEditorId] = useState<number | null>(null);
  const compact = useCompactLayout();
  const [plan, setPlan, planError] = useStored<number[]>(
    planKey(w.scope),
    [],
    validIds,
  );
  const query = w.work;
  const loadedItems = w.workItems;
  const count = Object.keys(edits).length;
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (count) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [count]);
  const save = async () => {
    const items = [
      ...new Map(
        [...(w.hours.data ?? []), ...loadedItems].map((i) => [i.id, i]),
      ).values(),
    ];
    const snapshot = Object.entries(edits);
    const prepared: { item: WorkItem; values: Record<string, unknown> }[] = [];
    try {
      for (const [id, entry] of snapshot) {
        const item = items.find((x) => x.id === Number(id));
        if (!item)
          throw new Error(
            `Item #${id} is no longer loaded. Discard changes and refresh before editing again.`,
          );
        prepared.push({
          item: { ...item, rev: entry.rev },
          values: patchValues(entry.values),
        });
      }
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const failures: string[] = [];
    let saved = 0;
    for (const change of prepared) {
      try {
        const response = await w.repo.update(change.item, change.values);
        const updated = {
          ...change.item,
          ...response,
          project: response.project ?? change.item.project,
          parentId: response.parentId ?? change.item.parentId,
          storyPointField:
            response.storyPointField ?? change.item.storyPointField,
          isTask: change.item.isTask,
          isStory: change.item.isStory,
        };
        w.replaceWorkItem(updated);
        client.setQueryData<WorkItem[]>(["hours-work", w.scope], (previous) =>
          previous?.map((i) => (i.id === updated.id ? updated : i)),
        );
        setEdits((previous) => {
          const next = { ...previous };
          delete next[updated.id];
          return next;
        });
        saved++;
      } catch (e) {
        failures.push(`#${change.item.id}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    if (failures.length)
      setError(
        `${saved} saved. Failed changes remain unsaved: ${failures.join(" · ")}. If Azure reports a conflict, discard and refresh before editing again.`,
      );
    else setMessage(`Saved changes to ${saved} work items.`);
  };
  if (w.loading && !w.meta)
    return <Loading label="Loading all accessible stories and tasks…" />;
  if (w.error)
    return (
      <>
        {w.settings.mode === "azure" && w.account && (
          <ProjectPicker disabled={busy} />
        )}
        <Notice tone="error">
          {w.error.message}
          <button onClick={w.refresh}>Retry loading projects</button>
        </Notice>
      </>
    );
  if (w.settings.mode === "azure" && w.account && !w.workProjects.length)
    return (
      <>
        <ProjectPicker />
      </>
    );
  if (!w.meta)
    return (
      <Empty title="Connect a workspace first">
        Open Settings to connect your Azure organization.
      </Empty>
    );
  if (query.error && !loadedItems.length)
    return (
      <>
        {w.settings.mode === "azure" && <ProjectPicker disabled={busy} />}
        <Notice tone="error">
          {query.error.message}
          <button onClick={() => void query.refetch()}>Retry</button>
        </Notice>
      </>
    );
  const configFor = (item: WorkItem) =>
    w.meta!.projectConfigs?.[item.project ?? ""];
  const items = loadedItems.map((i) => ({
    ...i,
    storyPointField:
      configFor(i)?.storyPointField ??
      i.storyPointField ??
      w.meta!.storyPointField,
  }));
  const projectName = (i: WorkItem) =>
    i.project ?? (w.settings.mode === "demo" ? "OMS" : "Unknown project");
  const projectNames = [
    ...new Set([
      ...w.workProjects.map((p) => p.name),
      ...items.map(projectName),
    ]),
  ].sort();
  const shown = items
    .filter((i) => !project || projectName(i) === project)
    .map((i) => effective(i, edits));
  const states = [
    ...new Set([
      ...w.meta.taskStates,
      ...(w.meta.storyStates ?? []),
      ...items.map((i) => i.state),
    ]),
  ].sort();
  const iterations = uniqueSprints(
    w.meta.iterations.filter(
      (i) => !project || !i.project || i.project === project,
    ),
  );
  const users = [
    ...new Set([
      ...w.meta.people.map((p) => p.identity),
      ...items.map((i) => i.assignedTo).filter(Boolean),
    ]),
  ].sort();
  const destinationOptions = [
    { value: "all", label: "All iterations" },
    { value: "current", label: "Current sprint" },
    { value: "backlog", label: "Backlog" },
    ...iterations.map((iteration) => ({
      value: iteration.path,
      label: iteration.path,
    })),
    ...[...new Set(shown.map((item) => item.iteration))]
      .filter(
        (path) =>
          path && !iterations.some((iteration) => iteration.path === path),
      )
      .map((path) => ({ value: path, label: `${path} (dates unavailable)` })),
  ];
  const userOptions = [
    { value: "mine", label: `My tasks (${owner || "token owner"})` },
    { value: "all", label: "All users" },
    ...users
      .filter((identity) => identity.toLowerCase() !== owner.toLowerCase())
      .map((identity) => ({
        value: identity,
        label:
          w.meta!.people.find((person) => person.identity === identity)?.name ??
          identity,
      })),
  ];
  const matchesFilters = (i: WorkItem) =>
    (selectedUsers.includes("all") ||
      selectedUsers.some((user) => owns(i, user, owner))) &&
    (statuses.includes("all") || statuses.includes(i.state)) &&
    (destinations.includes("all") ||
      destinations.some((destination) =>
        sprintMatches(
          i,
          destination,
          iterations,
          configFor(i)?.backlogPath ?? w.meta!.backlogPath,
        ),
      ));
  const stories = shown.filter(
      (i) => i.isStory ?? i.type === w.meta!.storyType,
    ),
    tasks = shown.filter((i) => i.isTask ?? i.type === w.meta!.taskType);
  const groups = groupWorkItems({
    stories,
    tasks,
    search,
    matchesFilters,
    plannedIds: today ? plan : undefined,
  });
  const change = (item: WorkItem, values: Record<string, string | number>) => {
    setMessage("");
    setError("");
    setEdits((previous) =>
      values["System.State"] !== undefined &&
      !(item.isStory ?? item.type === w.meta!.storyType)
        ? stageState(
            items,
            previous,
            item,
            String(values["System.State"]),
            w.meta!.projectConfigs?.[item.project ?? ""]?.taskFields ??
              w.meta!.taskFields,
          )
        : stage(
            items,
            previous,
            item.id,
            values,
            w.meta!.projectConfigs?.[item.project ?? ""]?.taskFields ??
              w.meta!.taskFields,
          ),
    );
  };
  const visibleTasks = groups.flatMap((g) => g.tasks);
  const visibleStories = groups.flatMap((g) => (g.story ? [g.story] : []));
  const fillHours = () => {
    setError("");
    setMessage("");
    try {
      // Validate raw drafts too: effective() converts a cleared input to zero.
      for (const task of visibleTasks)
        patchValues(edits[task.id]?.values ?? {});
      const supportedFields = (item: WorkItem) =>
        configFor(item)?.taskFields ?? w.meta!.taskFields;
      const result = fillSprintHours({
        tasks: visibleTasks,
        minimum: target.min,
        categories: selectedHourCategories,
        supportedFields,
        backlogPath: (item) =>
          configFor(item)?.backlogPath ?? w.meta!.backlogPath,
      });
      setEdits((previous) =>
        result.changes.reduce(
          (next, { item, values }) =>
            stage(items, next, item.id, values, supportedFields(item)),
          previous,
        ),
      );
      setMessage(
        [
          `${result.changes.length} tasks staged. Save changes to apply.`,
          ...result.summaries.map(
            (summary) =>
              `${summary.project ? `${summary.project} · ` : ""}${summary.iteration || "Backlog"}: ${
                summary.reason ??
                `Added ${summary.added}h across ${summary.changed} tasks`
              }. Completed hours matched for ${summary.completionOnly} other estimated tasks. ${summary.unmatched} titles unmatched for added hours; ${summary.unsupported} tasks unsupported for added hours.`,
          ),
        ].join(" "),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not fill sprint hours.",
      );
    }
  };
  const downloadExcel = async () => {
    setExporting(true);
    setError("");
    setMessage("");
    const prepare = (item: WorkItem) => ({
      ...item,
      project: projectName(item),
      url: `https://dev.azure.com/${encodeURIComponent(w.settings.mode === "demo" ? "demo" : w.settings.organization)}/${encodeURIComponent(projectName(item))}/_workitems/edit/${item.id}`,
    });
    try {
      const { exportWorkItems } = await import("./exportWorkItems");
      await exportWorkItems({
        stories: visibleStories.map(prepare),
        tasks: visibleTasks.map(prepare),
        today,
      });
      setMessage(
        `Exported ${visibleStories.length} user stories and ${visibleTasks.length} tasks to Excel. Current local edits are included.`,
      );
    } catch (e) {
      setError(
        `Excel export failed: ${e instanceof Error ? e.message : "Please try again."}`,
      );
    } finally {
      setExporting(false);
    }
  };
  const pickedTasks = visibleTasks.filter((i) => selected.includes(i.id));
  const pickedStories = visibleStories.filter((i) => selected.includes(i.id));
  const toggle = (id: number) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  const selectVisible = (list: WorkItem[], checked: boolean) =>
    setSelected((ids) =>
      checked
        ? [...new Set([...ids, ...list.map((i) => i.id)])]
        : ids.filter((id) => !list.some((i) => i.id === id)),
    );
  const statesFor = (item: WorkItem, story: boolean) =>
    story
      ? (configFor(item)?.storyStates ?? w.meta!.storyStates ?? [])
      : (configFor(item)?.taskStates ?? w.meta!.taskStates);
  const commonStates = (list: WorkItem[], story: boolean) =>
    list.length
      ? statesFor(list[0], story).filter((state) =>
          list.every((i) => statesFor(i, story).includes(state)),
        )
      : [];
  const applyBulk = (story: boolean) => {
    const list = story ? pickedStories : pickedTasks;
    const state = story ? storyState : taskState;
    const number = story ? bulkPoints : bulkEstimate;
    if (
      number !== "" &&
      (!Number.isFinite(Number(number)) ||
        Number(number) < 0 ||
        Number(number) > 10000)
    ) {
      setError("Enter a number between 0 and 10,000.");
      return;
    }
    if (state && !commonStates(list, story).includes(state)) {
      setError("Choose a state supported by every selected item.");
      return;
    }
    const changes = list.map((item) => {
      const values: Record<string, string | number> = {};
      if (state) values["System.State"] = state;
      if (!story && bulkAssignee !== "__keep")
        values["System.AssignedTo"] = bulkAssignee;
      const numericSupported = story
        ? !!item.storyPointField
        : canBulkEstimate(item) &&
          (configFor(item)?.taskFields ?? w.meta!.taskFields).includes(
            fields.estimate,
          );
      if (number !== "" && numericSupported)
        values[story ? item.storyPointField! : fields.estimate] =
          Number(number);
      return { item, values, skipped: number !== "" && !numericSupported };
    });
    const changed = changes.filter((c) => Object.keys(c.values).length).length;
    const skipped = changes.filter((c) => c.skipped).length;
    setEdits((previous) =>
      changes.reduce((next, { item, values: requested }) => {
        if (!Object.keys(requested).length) return next;
        const values = { ...requested };
        const supported = configFor(item)?.taskFields ?? w.meta!.taskFields;
        if (!story && state) {
          delete values["System.State"];
          next = stage(items, next, item.id, values, supported);
          return stageState(items, next, item, state, supported);
        }
        return stage(items, next, item.id, values, story ? [] : supported);
      }, previous),
    );
    setError("");
    setMessage(
      `${changed} selected ${story ? "stories" : "tasks"} staged. ${skipped ? `${skipped} skipped for the numeric change. ` : ""}Click Save changes to apply.`,
    );
  };
  const virtualRows = groups.flatMap((group) => [
    { group, item: undefined as WorkItem | undefined },
    ...group.tasks.map((item) => ({ group, item })),
  ]);
  return (
    <>
      {actionsTarget &&
        createPortal(
          <div className="actions">
            <button
              disabled={
                busy ||
                exporting ||
                query.isFetching ||
                !!query.error ||
                !groups.length
              }
              title="Export all stories and tasks in the current filtered view, including unsaved changes. Wait for loading to finish before exporting."
              onClick={() => void downloadExcel()}
            >
              <Download size={15} />
              {exporting ? "Exporting…" : "Export Excel"}
            </button>
            {count === 0 && (
              <button
                className="primary"
                disabled={busy || !count}
                onClick={() => void save()}
              >
                <Save size={15} />
                {busy ? "Saving…" : `Save changes${count ? ` (${count})` : ""}`}
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => {
                void query.refetch();
                if (w.settings.mode === "azure") w.refreshHours();
              }}
            >
              <RefreshCw size={15} />
              {query.isFetching ? "Refreshing…" : "Refresh"}
            </button>
            <Link className="button" to="/create">
              <Plus size={16} />
              Create stories
            </Link>
          </div>,
          actionsTarget,
        )}
      {w.settings.mode === "azure" && <ProjectPicker disabled={busy} />}
      {(query.isFetching || (query.error && !!w.workProgress)) && (
        <WorkLoadPanel
          progress={w.workProgress}
          loading={query.isFetching}
          failed={!!query.error}
          tasks={
            items.filter((i) => i.isTask ?? i.type === w.meta!.taskType).length
          }
          stories={
            items.filter((i) => i.isStory ?? i.type === w.meta!.storyType)
              .length
          }
        />
      )}
      {query.error && (
        <Notice tone="error">
          {query.error.message}
          <button onClick={() => void query.refetch()}>Retry</button>
        </Notice>
      )}
      {w.settings.mode === "azure" &&
        !items.length &&
        !query.isFetching &&
        !query.error && (
          <Notice tone="error">
            Azure loading finished with no accessible stories or tasks.
            Organization: {w.settings.organization}. Queried projects:{" "}
            {w.workProjects.map((p) => p.name).join(", ") || "none"}. Connected
            user: {w.account}. This is not caused by the list filters. Verify
            this organization contains your work items and that the token owner
            has project and Work Items read access.
            <button onClick={w.refresh}>Reload projects and work items</button>
          </Notice>
        )}
      <div className="loaded-summary">
        <p className="muted">
          Loaded{" "}
          {items.filter((i) => i.isTask ?? i.type === w.meta!.taskType).length}{" "}
          tasks and{" "}
          {
            items.filter((i) => i.isStory ?? i.type === w.meta!.storyType)
              .length
          }{" "}
          stories. List filters apply locally.
        </p>
        <button
          disabled={busy}
          onClick={() => {
            setSearch("");
            setStatuses(["all"]);
            setSelectedUsers(["all"]);
            setDestinations(["all"]);
            setProject("");
            setSelected([]);
          }}
        >
          Show all loaded items
        </button>
        <Notice compact label="How task changes work">
          Closing a task changes only that task. Bulk changes apply only to
          selected tasks. Changing a task status sets Completed Work to its
          current estimate. Loading and manual estimate edits do not change
          Completed Work. Hour bars include pending edits; Save changes applies
          them to Azure.
        </Notice>
        {count > 0 && (
          <Notice compact label={`${count} unsaved work items`}>
            {count} work items have unsaved changes. They are kept in this
            browser if you navigate away. Refresh preserves these edits; Save
            checks Azure revisions.
          </Notice>
        )}
      </div>
      {today && (
        <div className="plan-summary">
          <strong>
            {visibleTasks.length} planned{" "}
            {visibleTasks.length === 1 ? "item" : "items"}
          </strong>
          <span>Selected for today</span>
        </div>
      )}
      <div role="tablist" aria-label="Project filters" className="project-tabs">
        {["", ...projectNames].map((name) => (
          <button
            key={name || "all"}
            role="tab"
            aria-selected={project === name}
            disabled={busy}
            className={project === name ? "primary" : ""}
            onClick={() => {
              setProject(name);
              setSelected([]);
              setTaskState("");
              setStoryState("");
            }}
          >
            {name || "All"}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input
          aria-label="Search work"
          placeholder="Search story or task title / ID…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected([]);
          }}
        />
        <SearchableMultiSelect
          label="Filter status"
          options={[
            { value: "all", label: "All statuses" },
            ...states.map((state) => ({ value: state, label: state })),
          ]}
          value={statuses}
          allValue="all"
          onChange={(value) => {
            setStatuses(value);
            setSelected([]);
          }}
        />
        <SearchableMultiSelect
          label="Filter destination"
          options={destinationOptions}
          value={destinations}
          allValue="all"
          onChange={(value) => {
            setDestinations(value);
            setSelected([]);
          }}
        />
        <SearchableMultiSelect
          label="Filter user"
          options={userOptions}
          value={selectedUsers}
          allValue="all"
          disabled={busy}
          onChange={(value) => {
            setSelectedUsers(value);
            setSelected([]);
          }}
        />
      </div>
      {!today && (
        <Disclosure
          title="Fill sprint minimum"
          label="Configure sprint minimum"
          className="sprint-tools"
          summary={`${target.min}h target`}
        >
          <section className="bulk-toolbar" aria-label="Fill sprint hours">
            <strong>Sprint minimum: {target.min}h</strong>
            <div
              className="actions"
              role="group"
              aria-label="Hour allocation categories"
            >
              {hourCategories.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selectedHourCategories.includes(value)}
                  className={
                    selectedHourCategories.includes(value) ? "primary" : ""
                  }
                  disabled={busy}
                  onClick={() =>
                    setSelectedHourCategories((previous) => {
                      if (value === "auto") return ["auto"];
                      const manual = previous.filter(
                        (category) => category !== "auto",
                      );
                      const next = manual.includes(value)
                        ? manual.filter((category) => category !== value)
                        : [...manual, value];
                      return next.length ? next : ["auto"];
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={
                busy ||
                w.loading ||
                query.isFetching ||
                !!query.error ||
                !query.isSuccess ||
                !visibleTasks.length
              }
              onClick={fillHours}
            >
              Fill sprint minimum
            </button>
            <p className="muted">
              Fill each filtered sprint to {target.min}h, including closed and
              offscreen tasks. Choose multiple categories to share added hours
              across their tasks. Auto uses implementation, then testing, then
              code review per story. All filtered estimates count toward the
              total. Added hours are shared equally. Completed Work matches
              every estimated task, including tasks receiving no added hours.
              State and Remaining Work stay unchanged. Save changes to apply.
            </p>
          </section>
        </Disclosure>
      )}
      {destinations.includes("current") &&
        !iterations.some((iteration) => isIterationCurrent(iteration)) && (
          <Notice>
            No current sprint is configured for this view. Choose another sprint
            or All iterations.
          </Notice>
        )}
      {w.meta.warnings.map((warning, index) => (
        <Notice key={index}>{warning}</Notice>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
      {editError && <Notice tone="error">{editError}</Notice>}
      {planError && <Notice tone="error">{planError}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="selection-controls">
        <SelectAll
          label="Select all tasks"
          items={visibleTasks}
          selected={selected}
          disabled={busy}
          onChange={(checked) => selectVisible(visibleTasks, checked)}
        />
        <SelectAll
          label="Select all user stories"
          items={visibleStories}
          selected={selected}
          disabled={busy}
          onChange={(checked) => selectVisible(visibleStories, checked)}
        />
        <span className="muted">
          Selection applies to the current view. Uncheck any item to exclude it.
        </span>
        {selected.length > 0 && (
          <button disabled={busy} onClick={() => setSelected([])}>
            Clear selection
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {pickedTasks.length > 0 && (
          <AnimatedSection
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            key="task-actions"
            className="bulk-toolbar"
            aria-label="Selected task actions"
          >
            <strong>{pickedTasks.length} tasks selected</strong>
            <label>
              Assignee
              <select
                aria-label="Bulk assignee"
                value={bulkAssignee}
                onChange={(e) => setBulkAssignee(e.target.value)}
              >
                <option value="__keep">Keep current assignee</option>
                <option value="">Unassigned</option>
                {w.meta.people.map((p) => (
                  <option key={p.id} value={p.identity}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              State
              <select
                aria-label="Bulk task state"
                value={taskState}
                onChange={(e) => setTaskState(e.target.value)}
              >
                <option value="">Keep current state</option>
                {commonStates(pickedTasks, false).map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </label>
            <label>
              Estimate hours
              <input
                type="number"
                min="0"
                max="10000"
                step="0.1"
                aria-label="Bulk task estimate"
                value={bulkEstimate}
                onChange={(e) => setBulkEstimate(e.target.value)}
              />
            </label>
            <button
              disabled={
                busy ||
                (bulkAssignee === "__keep" && !taskState && bulkEstimate === "")
              }
              onClick={() => applyBulk(false)}
            >
              Apply to selected tasks
            </button>
            <p className="muted">
              Shared estimates preserve tasks currently at{" "}
              {BULK_ESTIMATE_EXCLUDED_HOURS}h and tasks without an estimate.
              State changes apply only to selected tasks.
            </p>
          </AnimatedSection>
        )}
        {pickedStories.length > 0 && (
          <AnimatedSection
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            key="story-actions"
            className="bulk-toolbar"
            aria-label="Selected story actions"
          >
            <strong>{pickedStories.length} user stories selected</strong>
            <label>
              State
              <select
                aria-label="Bulk story state"
                value={storyState}
                onChange={(e) => setStoryState(e.target.value)}
              >
                <option value="">Keep current state</option>
                {commonStates(pickedStories, true).map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </label>
            <label>
              Story points
              <input
                type="number"
                min="0"
                max="10000"
                step="0.5"
                aria-label="Bulk story points"
                value={bulkPoints}
                onChange={(e) => setBulkPoints(e.target.value)}
              />
            </label>
            <button
              disabled={busy || (!storyState && bulkPoints === "")}
              onClick={() => applyBulk(true)}
            >
              Apply to selected stories
            </button>
            <p className="muted">
              The same points value applies to each selected story with a
              supported points field. Story state changes leave child tasks
              unchanged.
            </p>
          </AnimatedSection>
        )}
      </AnimatePresence>
      {groups.length ? (
        <VirtualWorkList
          key={[
            project,
            ...selectedUsers,
            ...destinations,
            ...statuses,
            search,
          ].join(":")}
          rowCount={virtualRows.length}
          renderRow={(index) => {
            const row = virtualRows[index];
            const group = row.group;
            if (row.item) {
              const item = row.item;
              return (
                <div className="virtual-task" data-story-id={group.story?.id}>
                  <ItemRow
                    compact={compact}
                    onEditTask={() => setTaskEditorId(item.id)}
                    key={item.id}
                    item={item}
                    edits={edits}
                    busy={busy}
                    selected={selected.includes(item.id)}
                    onSelect={() =>
                      setSelected((ids) =>
                        ids.includes(item.id)
                          ? ids.filter((id) => id !== item.id)
                          : [...ids, item.id],
                      )
                    }
                    planned={plan.includes(item.id)}
                    onPlan={() =>
                      setPlan((ids) =>
                        ids.includes(item.id)
                          ? ids.filter((id) => id !== item.id)
                          : [...ids, item.id],
                      )
                    }
                    onChange={(values) => change(item, values)}
                    onEditTitle={() => setTitleEditor(item)}
                  />
                </div>
              );
            }
            return (
              <section className="virtual-story">
                {group.story && (
                  <div className="work-story">
                    <span className="type-badge">
                      {group.story.type.toUpperCase()} · #{group.story.id}
                    </span>
                    <div className="story-title-row">
                      <label className="story-selection">
                        <input
                          type="checkbox"
                          aria-label={`Select story: ${group.story.title}`}
                          checked={selected.includes(group.story.id)}
                          disabled={busy}
                          onChange={() => toggle(group.story!.id)}
                        />
                        <h2>{group.story.title}</h2>
                      </label>
                      <button
                        type="button"
                        className="icon title-edit"
                        aria-label={`Edit title: ${group.story.title}`}
                        disabled={busy}
                        onClick={() => setTitleEditor(group.story!)}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                    <div className="story-edit-controls">
                      <label>
                        State
                        <select
                          aria-label={`${group.story.title} story state`}
                          value={group.story.state}
                          disabled={busy}
                          onChange={(e) =>
                            change(group.story!, {
                              "System.State": e.target.value,
                            })
                          }
                        >
                          {[
                            ...new Set([
                              group.story.state,
                              ...statesFor(group.story, true),
                            ]),
                          ].map((state) => (
                            <option key={state}>{state}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Story points
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="0.5"
                          aria-label={`${group.story.title} story points`}
                          disabled={busy || !group.story.storyPointField}
                          value={
                            edits[group.story.id]?.values[
                              group.story.storyPointField ?? ""
                            ] ??
                            group.story.storyPoints ??
                            ""
                          }
                          onChange={(e) =>
                            change(group.story!, {
                              [group.story!.storyPointField!]: e.target.value,
                            })
                          }
                        />
                      </label>
                      {!!edits[group.story.id] && (
                        <span className="pill">Unsaved</span>
                      )}
                      {!group.story.storyPointField && (
                        <span className="muted">
                          Points unavailable for this process
                        </span>
                      )}
                    </div>
                    <div className="muted">
                      {group.story.project && `${group.story.project} · `}
                      {group.story.assignedTo || "Unassigned"} ·{" "}
                      {group.story.iteration} · {group.story.state} ·{" "}
                      {group.tasks.length} tasks
                    </div>
                  </div>
                )}
                {group.tasks.length > 0 ? (
                  <>
                    <div className="work-labels">
                      <span>Task</span>
                      <span>State</span>
                      <span>Assignee</span>
                      <span>Est. h</span>
                      <span>Left h</span>
                      <span>Spent h</span>
                      <span />
                    </div>
                  </>
                ) : (
                  <div className="muted padding">
                    No tasks under this story in the current view.
                  </div>
                )}
              </section>
            );
          }}
        />
      ) : (
        <Empty title={today ? "Your plan is empty" : "No matching work items"}>
          {today ? (
            <Link to="/work">Choose tasks from My work</Link>
          ) : (
            "Try another filter or create a story."
          )}
        </Empty>
      )}
      <AnimatePresence>
        {taskEditorId !== null &&
          (() => {
            const savedItem = items.find((item) => item.id === taskEditorId);
            if (!savedItem) return null;
            const item = effective(savedItem, edits);
            return (
              <Modal
                key={item.id}
                open
                onOpenChange={(open) => {
                  if (!open) setTaskEditorId(null);
                }}
                title={`Edit task #${item.id}`}
                kind="panel"
                closeLabel="Close task editor"
                description="Edits are staged locally. Use Save changes to update Azure."
              >
                <h3 className="task-detail-title">{item.title}</h3>
                <p className="muted">
                  {item.project} · {item.iteration}
                </p>
                <TaskTitleField
                  item={item}
                  disabled={busy}
                  onChange={(title) => change(item, { "System.Title": title })}
                />
                <div className="task-detail-fields">
                  <TaskFields
                    item={item}
                    edits={edits}
                    busy={busy}
                    labeled
                    onChange={(values) => change(item, values)}
                  />
                </div>
                <div className="dialog-actions">
                  <button type="button" onClick={() => setTaskEditorId(null)}>
                    Done
                  </button>
                </div>
              </Modal>
            );
          })()}
      </AnimatePresence>
      {count > 0 && (
        <motion.div
          key="save-bar"
          className="save-bar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={fade}
          aria-label="Unsaved changes"
        >
          <div>
            <strong>
              {count} work {count === 1 ? "item" : "items"} changed
            </strong>
            <p className="muted">Staged locally · Save to update Azure</p>
          </div>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() => {
                setEdits({});
                setError("");
                setMessage("Changes discarded.");
              }}
            >
              Discard changes
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              <Save size={15} />
              {busy ? "Saving…" : `Save changes (${count})`}
            </button>
          </div>
        </motion.div>
      )}
      <AnimatePresence>
        {titleEditor && (
          <TitleDialog
            item={titleEditor}
            onClose={() => setTitleEditor(null)}
            onSave={(title) => {
              change(titleEditor, { "System.Title": title });
              setTitleEditor(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
function TaskFields({
  item,
  edits,
  busy,
  onChange,
  labeled = false,
}: {
  item: WorkItem;
  edits: Edits;
  busy: boolean;
  labeled?: boolean;
  onChange: (values: Record<string, string | number>) => void;
}) {
  const w = useWorkspace();
  const config = w.meta!.projectConfigs?.[item.project ?? ""];
  const field = (label: string, control: ReactNode) =>
    labeled ? (
      <label>
        {label}
        {control}
      </label>
    ) : (
      control
    );
  const num = (name: "estimate" | "remaining" | "completed", label: string) =>
    field(
      label,
      <input
        type="number"
        min="0"
        max="10000"
        step="0.01"
        inputMode="decimal"
        aria-label={`${item.title} ${name} hours`}
        disabled={
          busy ||
          !(config?.taskFields ?? w.meta!.taskFields).includes(fields[name])
        }
        value={edits[item.id]?.values[fields[name]] ?? item[name] ?? ""}
        onChange={(event) => onChange({ [fields[name]]: event.target.value })}
      />,
    );
  return (
    <>
      {field(
        "State",
        <select
          aria-label={`${item.title} state`}
          value={item.state}
          disabled={busy}
          onChange={(event) => onChange({ "System.State": event.target.value })}
        >
          {[
            ...new Set([
              item.state,
              ...(config?.taskStates ?? w.meta!.taskStates),
            ]),
          ].map((state) => (
            <option key={state}>{state}</option>
          ))}
        </select>,
      )}
      {field(
        "Assignee",
        <select
          aria-label={`${item.title} assignee`}
          value={item.assignedTo}
          disabled={busy}
          onChange={(event) =>
            onChange({ "System.AssignedTo": event.target.value })
          }
        >
          <option value="">Unassigned</option>
          {item.assignedTo &&
            !w.meta!.people.some(
              (person) => person.identity === item.assignedTo,
            ) && <option value={item.assignedTo}>{item.assignedTo}</option>}
          {w.meta!.people.map((person) => (
            <option key={person.id} value={person.identity}>
              {person.name}
            </option>
          ))}
        </select>,
      )}
      {num("estimate", "Original estimate (hours)")}
      {num("remaining", "Remaining work (hours)")}
      {num("completed", "Completed work (hours)")}
      {labeled && (
        <p className="field-help">
          Fields unavailable in this project's process are disabled.
        </p>
      )}
    </>
  );
}

function TaskTitleField({
  item,
  disabled,
  onChange,
}: {
  item: WorkItem;
  disabled: boolean;
  onChange: (title: string) => void;
}) {
  const [title, setTitle] = useState(item.title);
  return (
    <label className="task-detail-fields">
      Title
      <input
        aria-label="Work item title"
        maxLength={255}
        disabled={disabled}
        value={title}
        aria-invalid={!title.trim()}
        onChange={(event) => {
          const value = event.target.value;
          setTitle(value);
          if (value.trim()) onChange(value.trim());
        }}
      />
      {!title.trim() && (
        <span role="alert">
          Enter a title. The last valid title is kept until you do.
        </span>
      )}
    </label>
  );
}

function ItemRow({
  item,
  edits,
  busy,
  selected,
  onSelect,
  planned,
  onPlan,
  onChange,
  onEditTitle,
  compact,
  onEditTask,
}: {
  item: WorkItem;
  edits: Edits;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  planned: boolean;
  onPlan: () => void;
  onChange: (values: Record<string, string | number>) => void;
  onEditTitle: () => void;
  compact: boolean;
  onEditTask: () => void;
}) {
  return (
    <div
      className={`work-row${compact ? " work-row-mobile" : ""}`}
      data-dirty={!!edits[item.id]}
    >
      <div className="work-title">
        <input
          type="checkbox"
          aria-label={`Select task: ${item.title}`}
          checked={selected}
          disabled={busy}
          onChange={onSelect}
        />
        <span>
          <span className="muted">
            #{item.id}
            {edits[item.id] ? " · Unsaved" : ""}
          </span>
          <br />
          <span className="work-title-text">{item.title}</span>
          {!compact && (
            <button
              type="button"
              className="icon title-edit"
              aria-label={`Edit title: ${item.title}`}
              disabled={busy}
              onClick={onEditTitle}
            >
              <Pencil size={14} />
            </button>
          )}
          {item.url && (
            <a
              className="external"
              href={item.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${item.title} in Azure`}
            >
              <ExternalLink size={12} />
            </a>
          )}
          {compact && (
            <span className="task-row-summary">
              <span className="task-status">{item.state}</span>
              <span>{item.estimate ?? 0}h estimated</span>
            </span>
          )}
        </span>
      </div>
      {compact ? (
        <button
          type="button"
          disabled={busy}
          aria-label={`Edit task: ${item.title}`}
          onClick={onEditTask}
        >
          Edit
        </button>
      ) : (
        <TaskFields item={item} edits={edits} busy={busy} onChange={onChange} />
      )}
      <button
        type="button"
        className={`icon ${planned ? "planned" : ""}`}
        aria-label={`${planned ? "Remove from" : "Add to"} today: ${item.title}`}
        onClick={onPlan}
      >
        <Plus
          size={16}
          style={{ transform: planned ? "rotate(45deg)" : "none" }}
        />
      </button>
    </div>
  );
}

function TitleDialog({
  item,
  onClose,
  onSave,
}: {
  item: WorkItem;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const trimmed = title.trim();
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Edit title"
      description={`${item.type} #${item.id}`}
      closeLabel="Close title editor"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onSave(trimmed);
        }}
      >
        <label>
          Title
          <input
            autoFocus
            aria-label="Work item title"
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={!trimmed}>
            Save title
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SelectAll({
  label,
  items,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  items: WorkItem[];
  selected: number[];
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const count = items.filter((i) => selected.includes(i.id)).length;
  useEffect(() => {
    if (ref.current)
      ref.current.indeterminate = count > 0 && count < items.length;
  }, [count, items.length]);
  return (
    <label>
      <input
        ref={ref}
        type="checkbox"
        aria-label={label}
        disabled={disabled || !items.length}
        checked={items.length > 0 && count === items.length}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label} ({items.length})
    </label>
  );
}
