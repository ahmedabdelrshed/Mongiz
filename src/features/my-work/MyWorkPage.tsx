import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, ExternalLink, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../../app/Workspace";
import { fields, type WorkItem } from "../../shared/api/types";
import { Empty, Loading, Notice, PageTitle } from "../../shared/ui/Common";
import { storageKey, useStored } from "../../shared/storage/storage";
import { ProjectPicker } from "./ProjectPicker";
import { VirtualWorkList } from "./VirtualWorkList";
import { HoursPanel } from "./HoursPanel";
import { owns, sprintMatches, uniqueSprints } from "./filters";
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
  const [edits, setEdits, editError] = useStored<Edits>(
    storageKey(w.scope, "work-edits"),
    {},
    isEdits,
  );
  return (
    <>
      {!today && <HoursPanel edits={edits} />}
      <WorkList
        key={w.workQueryKey.join(":")}
        today={today}
        edits={edits}
        setEdits={setEdits}
        editError={editError}
      />
    </>
  );
}
function WorkList({
  today,
  edits,
  setEdits,
  editError,
}: { today: boolean } & DraftProps) {
  const w = useWorkspace(),
    client = useQueryClient();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [destination, setDestination] = useState("current");
  const [user, setUser] = useState("mine");
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
  const [plan, setPlan, planError] = useStored<number[]>(
    planKey(w.scope),
    [],
    validIds,
  );
  const query = w.work;
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
        [...(w.hours.data ?? []), ...(query.data ?? [])].map((i) => [i.id, i]),
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
        client.setQueriesData<WorkItem[]>(
          { queryKey: ["work", w.scope] },
          (previous) =>
            previous?.map((i) => (i.id === updated.id ? updated : i)),
        );
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
  if ((w.loading && !w.meta) || (query.isPending && w.meta))
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
        <PageTitle
          title="My projects"
          subtitle="Choose the projects Mongiz should load. No work items are requested until you choose."
        />
        <ProjectPicker />
      </>
    );
  if (!w.meta)
    return (
      <Empty title="Connect a workspace first">
        Open Settings to connect your Azure organization.
      </Empty>
    );
  if (query.error)
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
  const items = (query.data ?? []).map((i) => ({
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
  const matches = (i: WorkItem) =>
    owns(i, user, owner) &&
    (!status || i.state === status) &&
    sprintMatches(
      i,
      destination,
      iterations,
      configFor(i)?.backlogPath ?? w.meta!.backlogPath,
    ) &&
    (i.title.toLowerCase().includes(search.toLowerCase()) ||
      String(i.id).includes(search));
  const stories = shown.filter(
      (i) => i.isStory ?? i.type === w.meta!.storyType,
    ),
    tasks = shown.filter((i) => i.isTask ?? i.type === w.meta!.taskType);
  const groups = [
    ...stories
      .map((story) => ({
        story,
        tasks: tasks.filter(
          (t) =>
            t.parentId === story.id &&
            matches(t) &&
            (!today || plan.includes(t.id)),
        ),
      }))
      .filter((g) =>
        today
          ? g.tasks.some(matches)
          : matches(g.story) || g.tasks.some(matches),
      ),
    ...tasks
      .filter(
        (t) =>
          !stories.some((s) => s.id === t.parentId) &&
          (!today || plan.includes(t.id)) &&
          matches(t),
      )
      .map((t) => ({ story: undefined, tasks: [t] })),
  ];
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
      <PageTitle
        title={today ? "Today’s plan" : "My work"}
        subtitle="Stories with tasks matching your user and sprint filters. Edits stay local until Save changes."
        action={
          <div className="actions">
            <button
              className="primary"
              disabled={busy || !count}
              onClick={() => void save()}
            >
              <Save size={15} />
              {busy ? "Saving…" : `Save changes${count ? ` (${count})` : ""}`}
            </button>
            {count > 0 && (
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
            )}
            <button
              disabled={busy || query.isFetching}
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
          </div>
        }
      />
      {w.settings.mode === "azure" && <ProjectPicker disabled={busy} />}
      {w.settings.mode === "azure" && !items.length && (
        <Notice tone="error">
          Azure loading finished with no accessible stories or tasks.
          Organization: {w.settings.organization}. Queried projects:{" "}
          {w.workProjects.map((p) => p.name).join(", ") || "none"}. Connected
          user: {w.account}. This is not caused by the list filters. Verify this
          organization contains your work items and that the token owner has
          project and Work Items read access.
          <button onClick={w.refresh}>Reload projects and work items</button>
        </Notice>
      )}
      <p className="muted">
        Loaded{" "}
        {items.filter((i) => i.isTask ?? i.type === w.meta!.taskType).length}{" "}
        tasks and{" "}
        {items.filter((i) => i.isStory ?? i.type === w.meta!.storyType).length}{" "}
        stories. List filters apply locally.
      </p>
      <button
        disabled={busy}
        onClick={() => {
          setSearch("");
          setStatus("");
          setUser("all");
          setDestination("all");
          setProject("");
          setSelected([]);
        }}
      >
        Show all loaded items
      </button>
      <Notice>
        Closing one task stages the same closed state for all tasks under its
        story, including tasks assigned to other users. Changing a task status
        sets Completed Work to its current estimate. Loading and estimate edits
        do not change Completed Work. Hour bars include pending edits; Save
        changes applies them to Azure.
      </Notice>
      {count > 0 && (
        <Notice>
          {count} work items have unsaved changes. They are kept in this browser
          if you navigate away. Refresh preserves these edits; Save checks Azure
          revisions.
        </Notice>
      )}
      {today && (
        <div className="plan-summary">
          <strong>
            {groups.reduce((n, g) => n + g.tasks.length, 0)} planned items
          </strong>
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
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setSelected([]);
          }}
        >
          <option value="">All statuses</option>
          {states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Filter destination"
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setSelected([]);
          }}
        >
          <option value="all">All iterations</option>
          <option value="current">Current sprint</option>
          <option value="backlog">Backlog</option>
          {iterations.map((i) => (
            <option key={i.path} value={i.path}>
              {i.path}
            </option>
          ))}
          {[...new Set(shown.map((i) => i.iteration))]
            .filter((path) => path && !iterations.some((i) => i.path === path))
            .map((path) => (
              <option key={path} value={path}>
                {path} (dates unavailable)
              </option>
            ))}
        </select>
        <select
          aria-label="Filter user"
          value={user}
          disabled={busy}
          onChange={(e) => {
            setUser(e.target.value);
            setSelected([]);
          }}
        >
          <option value="mine">My tasks ({owner || "token owner"})</option>
          <option value="all">All users</option>
          {users
            .filter(
              (identity) => identity.toLowerCase() !== owner.toLowerCase(),
            )
            .map((identity) => (
              <option key={identity} value={identity}>
                {w.meta!.people.find((p) => p.identity === identity)?.name ??
                  identity}
              </option>
            ))}
        </select>
      </div>
      {destination === "current" && !iterations.some((i) => i.current) && (
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
      {pickedTasks.length > 0 && (
        <section className="bulk-toolbar" aria-label="Selected task actions">
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
            Closing a task also closes all its siblings.
          </p>
        </section>
      )}
      {pickedStories.length > 0 && (
        <section className="bulk-toolbar" aria-label="Selected story actions">
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
        </section>
      )}
      {groups.length ? (
        <VirtualWorkList
          key={project + user + destination + status + search}
          rowCount={virtualRows.length}
          renderRow={(index) => {
            const row = virtualRows[index];
            const group = row.group;
            if (row.item) {
              const item = row.item;
              return (
                <div className="virtual-task" data-story-id={group.story?.id}>
                  <ItemRow
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
          Try another filter or create a story.
        </Empty>
      )}
    </>
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
}: {
  item: WorkItem;
  edits: Edits;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  planned: boolean;
  onPlan: () => void;
  onChange: (values: Record<string, string | number>) => void;
}) {
  const w = useWorkspace();
  const config = w.meta!.projectConfigs?.[item.project ?? ""];
  const num = (name: "estimate" | "remaining" | "completed") => (
    <input
      type="number"
      min="0"
      max="10000"
      step="0.1"
      aria-label={`${item.title} ${name} hours`}
      disabled={
        busy ||
        !(config?.taskFields ?? w.meta!.taskFields).includes(fields[name])
      }
      value={edits[item.id]?.values[fields[name]] ?? item[name] ?? ""}
      onChange={(e) => onChange({ [fields[name]]: e.target.value })}
    />
  );
  return (
    <div className="work-row" data-dirty={!!edits[item.id]}>
      <label className="work-title">
        <input
          type="checkbox"
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
          {item.title}
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
        </span>
      </label>
      <select
        aria-label={`${item.title} state`}
        value={item.state}
        disabled={busy}
        onChange={(e) => onChange({ "System.State": e.target.value })}
      >
        {[
          ...new Set([
            item.state,
            ...(config?.taskStates ?? w.meta!.taskStates),
          ]),
        ].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select
        aria-label={`${item.title} assignee`}
        value={item.assignedTo}
        disabled={busy}
        onChange={(e) => onChange({ "System.AssignedTo": e.target.value })}
      >
        <option value="">Unassigned</option>
        {item.assignedTo &&
          !w.meta!.people.some((p) => p.identity === item.assignedTo) && (
            <option value={item.assignedTo}>{item.assignedTo}</option>
          )}
        {w.meta!.people.map((p) => (
          <option key={p.id} value={p.identity}>
            {p.name}
          </option>
        ))}
      </select>
      {num("estimate")}
      {num("remaining")}
      {num("completed")}
      <button
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
