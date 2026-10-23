import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { fade } from "../../shared/ui/Motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRightLeft, RefreshCw } from "lucide-react";
import { useWorkspace } from "../../app/Workspace";
import type { Choice, WorkItem } from "../../shared/api/types";
import {
  BusyIndicator,
  Empty,
  Loading,
  Notice,
  PageTitle,
} from "../../shared/ui/Common";
import { SearchableMultiSelect } from "../../shared/ui/SearchableMultiSelect";
import { readStored, storageKey } from "../../shared/storage/storage";
import { isEdits } from "../my-work/edits";
import {
  buildMovePlan,
  changedItems,
  executeMove,
  filterStories,
  isStory,
  isTask,
  type MovePlan,
  type MoveResult,
} from "./model";

export function MoveStoriesPage() {
  const w = useWorkspace();
  return <ProjectPage key={w.scope} />;
}
function ProjectPage() {
  const w = useWorkspace();
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const project = w.projects.find((p) => p.id === projectId);
  return (
    <>
      <PageTitle
        title="Move stories"
        subtitle="Move project stories between iterations and choose which task statuses to include."
      />
      <section className="move-panel project-scope">
        <label>
          Project
          <select
            aria-label="Project to move stories"
            value={projectId}
            disabled={busy}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">Choose a project</option>
            {w.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Choose from all accessible projects. Stories move within the selected
          project.
        </p>
      </section>
      {!w.projects.length &&
        (w.loading ? (
          <Loading label="Loading accessible projects…" />
        ) : (
          <Notice tone="error">
            {w.error?.message ??
              "No accessible projects found. Check your connection in Settings."}
            <button onClick={w.refresh}>Retry loading projects</button>
          </Notice>
        ))}
      {project ? (
        <ProjectStories key={project.id} project={project} onBusy={setBusy} />
      ) : (
        <Empty title="Choose a project">
          Load its stories from all users and iterations.
        </Empty>
      )}
    </>
  );
}

type Review = { plan: MovePlan; taskStates: string[]; retry: boolean };
function ProjectStories({
  project,
  onBusy,
}: {
  project: Choice;
  onBusy: (busy: boolean) => void;
}) {
  const w = useWorkspace();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState(["all"]);
  const [source, setSource] = useState("all");
  const [destination, setDestination] = useState("");
  const [taskStates, setTaskStates] = useState<string[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [results, setResults] = useState<MoveResult[]>([]);
  const [batch, setBatch] = useState<{
    destination: string;
    taskStates: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const submitting = useRef(false);
  const selectAll = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const prefix = [w.scope, project.id];
  const itemsKey = ["move-stories-items", ...prefix];
  const metadata = useQuery({
    queryKey: ["move-stories-metadata", ...prefix],
    queryFn: () => w.repo.workMetadata([project]),
    retry: false,
    staleTime: Infinity,
  });
  const iterations = useQuery({
    queryKey: ["move-stories-iterations", ...prefix],
    queryFn: () => w.repo.projectIterations(project),
    retry: false,
    staleTime: Infinity,
  });
  const normalize = (items: WorkItem[]) =>
    items.map((item) => ({ ...item, project: item.project ?? project.name }));
  const items = useQuery({
    queryKey: itemsKey,
    queryFn: async () =>
      normalize(await w.repo.listMine("all", metadata.data!)),
    enabled: !!metadata.data,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const config = metadata.data?.projectConfigs?.[project.name] ?? metadata.data;
  const rows = items.data ?? [];
  const stories = config
    ? rows.filter(
        (item) => item.project === project.name && isStory(item, config),
      )
    : [];
  const tasks = config
    ? rows.filter(
        (item) => item.project === project.name && isTask(item, config),
      )
    : [];
  const shown = filterStories(stories, search, statuses, source);
  const visibleKey = shown.map((item) => item.id).join(",");
  useEffect(() => {
    const ids = new Set(shown.map((item) => item.id));
    setSelected((previous) => previous.filter((id) => ids.has(id)));
  }, [visibleKey]);
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate =
        selected.length > 0 && selected.length < shown.length;
  }, [selected.length, shown.length]);
  useEffect(() => {
    onBusy(busy);
  }, [busy, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  const storyStatuses = [
    ...new Set([
      ...(config?.storyStates ?? []),
      ...stories.map((i) => i.state),
    ]),
  ].sort();
  const taskStatuses = [
    ...new Set([...(config?.taskStates ?? []), ...tasks.map((i) => i.state)]),
  ].sort();
  const includedTaskStates = taskStates.includes("all")
    ? taskStatuses
    : taskStates;
  const taskCounts = new Map<number, number>();
  for (const task of tasks)
    if (task.parentId && includedTaskStates.includes(task.state))
      taskCounts.set(task.parentId, (taskCounts.get(task.parentId) ?? 0) + 1);
  const destinations = iterations.data ?? [];
  const sources = [
    ...new Set([
      ...destinations.map((i) => i.path),
      ...stories.map((i) => i.iteration),
    ]),
  ].sort();
  const loadError = metadata.error ?? iterations.error ?? items.error;
  const loading =
    metadata.isPending ||
    iterations.isPending ||
    (metadata.data && items.isPending);
  const invalidateReview = () => {
    setReview(null);
    setError("");
  };
  const pendingEdits = (plan: MovePlan) => {
    const edits = readStored(storageKey(w.scope, "work-edits"), {}, isEdits);
    return changedItems(plan).filter((item) => edits[item.id]);
  };
  const checkEdits = (plan: MovePlan) => {
    const dirty = pendingEdits(plan);
    if (dirty.length)
      throw new Error(
        `Save or discard unsaved My work edits for ${dirty.map((i) => "#" + i.id).join(", ")} before moving.`,
      );
  };
  const reload = async () => {
    const meta = await metadata.refetch();
    if (meta.error) throw meta.error;
    const tree = await iterations.refetch();
    if (tree.error) throw tree.error;
    const fresh = normalize(await w.repo.listMine("all", meta.data!));
    client.setQueryData(itemsKey, fresh);
    return {
      rows: fresh,
      config: meta.data!.projectConfigs?.[project.name] ?? meta.data!,
      iterations: tree.data!,
    };
  };
  const refresh = async () => {
    setBusy(true);
    invalidateReview();
    setSelected([]);
    try {
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const prepare = () => {
    try {
      setError("");
      if (!config || !destinations.some((i) => i.path === destination))
        throw new Error("Choose a destination iteration.");
      const plan = buildMovePlan({
        project: project.name,
        items: rows,
        storyIds: selected,
        destination,
        taskStates: includedTaskStates,
        config,
      });
      checkEdits(plan);
      if (!changedItems(plan).length)
        throw new Error(
          "Nothing to move. Selected items are already in the destination or no tasks match.",
        );
      setReview({ plan, taskStates: includedTaskStates, retry: false });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const retry = async () => {
    if (!batch) return;
    setBusy(true);
    invalidateReview();
    try {
      const fresh = await reload();
      if (!fresh.iterations.some((i) => i.path === batch.destination))
        throw new Error(
          "The original destination is no longer available. Start a new move.",
        );
      const unfinished = results.filter((r) => r.retryable);
      const plan = buildMovePlan({
        project: project.name,
        items: fresh.rows,
        storyIds: [...new Set(unfinished.map((r) => r.storyId))],
        destination: batch.destination,
        taskStates: batch.taskStates,
        config: fresh.config,
        pendingIds: unfinished.map((r) => r.item.id),
      });
      checkEdits(plan);
      // Reconcile writes with a lost response and tasks whose status changed.
      const remaining = new Set(changedItems(plan).map((i) => i.id));
      const reconciled = results.map((result): MoveResult => {
        if (!result.retryable || remaining.has(result.item.id)) return result;
        const current = fresh.rows.find((i) => i.id === result.item.id);
        if (current?.iteration === batch.destination) {
          w.replaceWorkItem(current);
          return {
            ...result,
            item: current,
            status: "moved",
            retryable: false,
            message: "Already in destination after refresh.",
          };
        }
        return {
          ...result,
          status: "skipped",
          retryable: false,
          message: "No longer matches the selected task statuses or project.",
        };
      });
      setResults(reconciled);
      setDestination(batch.destination);
      setTaskStates(batch.taskStates);
      if (remaining.size)
        setReview({ plan, taskStates: batch.taskStates, retry: true });
      else
        setError(
          "No unfinished changes remain after refreshing. See the updated results below.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!review || submitting.current) return;
    try {
      checkEdits(review.plan);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    const snapshot = review;
    const total = changedItems(snapshot.plan).length;
    setProgress({ done: 0, total });
    if (!snapshot.retry) setResults([]);
    setBatch({
      destination: snapshot.plan.destination,
      taskStates: snapshot.taskStates,
    });
    const operationIds = new Set(changedItems(snapshot.plan).map((i) => i.id));
    try {
      await executeMove(
        snapshot.plan,
        w.repo,
        (result) => {
          setResults((previous) => [
            ...previous.filter((r) => r.item.id !== result.item.id),
            result,
          ]);
          if (operationIds.has(result.item.id))
            setProgress((p) => ({ ...p, done: p.done + 1 }));
        },
        (updated) => {
          client.setQueryData<WorkItem[]>(itemsKey, (previous) =>
            previous?.map((i) => (i.id === updated.id ? updated : i)),
          );
          w.replaceWorkItem(updated);
        },
      );
      setReview(null);
      setSelected([]);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const options = (values: string[]) =>
    values.map((value) => ({ value, label: value }));
  const candidate =
    config && destination && destinations.some((i) => i.path === destination)
      ? buildMovePlan({
          project: project.name,
          items: rows,
          storyIds: selected.filter((id) => stories.some((i) => i.id === id)),
          destination,
          taskStates: includedTaskStates,
          config,
        })
      : null;
  const hasChanges = candidate && changedItems(candidate).length > 0;
  return (
    <div className="move-stories">
      <div className="workflow-steps" aria-label="Move workflow">
        <span className={!review && !results.length ? "current" : ""}>
          1 · Select stories
        </span>
        <span aria-hidden="true">›</span>
        <span className={review ? "current" : ""}>2 · Review changes</span>
        <span aria-hidden="true">›</span>
        <span className={results.length ? "current" : ""}>3 · Results</span>
      </div>
      <div className="move-toolbar">
        <h2>{project.name} stories</h2>
        <button disabled={busy || !!loading} onClick={() => void refresh()}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {error && (
        <Notice tone="error">
          {error} <Link to="/work">Open My work</Link>
        </Notice>
      )}
      {loadError && (
        <Notice tone="error">
          {loadError.message}{" "}
          <button disabled={busy} onClick={() => void refresh()}>
            Retry loading
          </button>
        </Notice>
      )}
      {loading && !loadError && (
        <Loading label="Loading project stories, tasks, and iterations…" />
      )}
      {!loading && !loadError && (
        <>
          {!!metadata.data?.warnings.length && (
            <Notice>{metadata.data.warnings.join(" · ")}</Notice>
          )}
          <fieldset className="move-controls" disabled={busy}>
            <legend>Find stories</legend>
            <label>
              Search stories
              <input
                aria-label="Search stories"
                placeholder="Title or ID"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  invalidateReview();
                }}
              />
            </label>
            <label>
              Story status
              <SearchableMultiSelect
                label="Filter story status"
                allValue="all"
                value={statuses}
                options={[
                  { value: "all", label: "All story statuses" },
                  ...options(storyStatuses),
                ]}
                disabled={busy}
                onChange={(value) => {
                  setStatuses(value);
                  invalidateReview();
                }}
              />
            </label>
            <label>
              Source iteration
              <select
                aria-label="Source iteration"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  invalidateReview();
                }}
              >
                <option value="all">All source iterations</option>
                {sources.map((path) => (
                  <option key={path}>{path}</option>
                ))}
              </select>
            </label>
          </fieldset>
          <section className="move-panel" aria-label="Project stories">
            <div className="move-toolbar">
              <label className="move-check">
                <input
                  ref={selectAll}
                  type="checkbox"
                  aria-label="Select all filtered stories"
                  disabled={busy || !shown.length}
                  checked={!!shown.length && selected.length === shown.length}
                  onChange={(e) => {
                    setSelected(e.target.checked ? shown.map((i) => i.id) : []);
                    invalidateReview();
                  }}
                />
                Select all ({shown.length})
              </label>
              <span className="muted">{selected.length} selected</span>
            </div>
            {!shown.length && (
              <Empty title="No matching stories">
                Change your search or filters.
              </Empty>
            )}
            <div className="move-story-list">
              {shown.map((story) => (
                <label className="move-story-row" key={story.id}>
                  <input
                    type="checkbox"
                    aria-label={`Select story #${story.id}: ${story.title}`}
                    checked={selected.includes(story.id)}
                    disabled={busy}
                    onChange={(e) => {
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, story.id]
                          : ids.filter((id) => id !== story.id),
                      );
                      invalidateReview();
                    }}
                  />
                  <span>
                    <strong>
                      #{story.id} {story.title}
                    </strong>
                    <span className="move-story-details">
                      {story.state} · {story.iteration}
                    </span>
                  </span>
                  <span className="move-task-count">
                    {taskCounts.get(story.id) ?? 0} matching tasks
                  </span>
                </label>
              ))}
            </div>
          </section>
          <fieldset className="move-controls" disabled={busy}>
            <legend>Move destination and tasks</legend>
            <label>
              Destination iteration
              <select
                aria-label="Destination iteration"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  invalidateReview();
                }}
              >
                <option value="">Choose destination</option>
                {destinations.map((i) => (
                  <option key={i.path} value={i.path}>
                    {i.path}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Task statuses to move
              <SearchableMultiSelect
                label="Task statuses to move"
                allValue="all"
                allowEmpty
                value={taskStates}
                options={[
                  { value: "all", label: "All task statuses" },
                  ...options(taskStatuses),
                ]}
                disabled={busy}
                onChange={(value) => {
                  setTaskStates(value);
                  invalidateReview();
                }}
              />
            </label>
            <p className="muted">
              {!taskStates.length
                ? "No task statuses selected: only stories will move."
                : "Direct child tasks with the selected statuses will move, regardless of assignee or current iteration."}
            </p>
          </fieldset>
          <button
            className="primary"
            disabled={busy || !hasChanges}
            onClick={prepare}
          >
            <ArrowRightLeft size={16} /> Review move
          </button>
        </>
      )}
      {review && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={fade}
          className="move-panel move-review"
          aria-label="Review move"
        >
          <h2 tabIndex={-1} ref={reviewHeading}>
            Review {review.retry ? "unfinished changes" : "move"}
          </h2>
          <p>
            Destination: <strong>{review.plan.destination}</strong>
          </p>
          <p>
            {
              changedItems(review.plan).filter((i) => isStory(i, config!))
                .length
            }{" "}
            stories and{" "}
            {review.plan.groups.reduce((sum, g) => sum + g.tasks.length, 0)}{" "}
            tasks will change. {review.plan.skipped.length} already in
            destination.
          </p>
          {review.plan.groups.map((group) => (
            <div className="move-review-group" key={group.story.id}>
              <strong>
                #{group.story.id} {group.story.title}
              </strong>
              <p className="muted">
                {group.moveStory
                  ? `${group.story.iteration} → ${review.plan.destination}`
                  : "Story already in destination"}
              </p>
              {!!group.tasks.length && (
                <ul>
                  {group.tasks.map((task) => (
                    <li key={task.id}>
                      #{task.id} {task.title} — {task.state} · {task.iteration}{" "}
                      → {review.plan.destination}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {pendingEdits(review.plan).length > 0 && (
            <Notice tone="error">
              Save or discard unsaved My work edits before moving.{" "}
              <Link to="/work">Open My work</Link>
            </Notice>
          )}
          <div className="actions">
            <button disabled={busy} onClick={() => setReview(null)}>
              Cancel review
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                !changedItems(review.plan).length ||
                !!pendingEdits(review.plan).length
              }
              onClick={() => void submit()}
              aria-busy={busy}
            >
              {busy && <BusyIndicator />}
              Move
            </button>
          </div>
        </motion.section>
      )}
      {busy && progress.total > 0 && (
        <div role="status" aria-live="polite">
          Processed {progress.done} of {progress.total} changes.
          <progress
            aria-label="Move progress"
            value={progress.done}
            max={progress.total}
          />
        </div>
      )}
      {!!results.length && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={fade}
          className="move-panel"
          aria-label="Move results"
          aria-live="polite"
        >
          <h2>Move results</h2>
          <p>
            Destination: <strong>{batch?.destination}</strong>
          </p>
          <p>
            {results.filter((r) => r.status === "moved").length} moved ·{" "}
            {results.filter((r) => r.status === "failed").length} failed ·{" "}
            {results.filter((r) => r.status === "skipped").length} skipped
          </p>
          <ul className="move-results-list">
            {results.map((result) => (
              <li key={result.item.id}>
                <strong>
                  #{result.item.id} {result.item.title}
                </strong>
                : {result.status}
                {result.message ? ` — ${result.message}` : ""}
              </li>
            ))}
          </ul>
          {results.some((r) => r.retryable) && (
            <button disabled={busy} onClick={() => void retry()}>
              Retry failed
            </button>
          )}
        </motion.section>
      )}
    </div>
  );
}
