import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
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
import { isEdits, patchValues } from "../my-work/edits";
import { isStory } from "../move-stories/model";

export function StoryPointsPage() {
  const w = useWorkspace();
  return <ProjectPage key={w.scope} />;
}

function ProjectPage() {
  const w = useWorkspace();
  const [projectId, setProjectId] = useState(
    w.workProjects.length === 1 ? w.workProjects[0].id : "",
  );
  const [busy, setBusy] = useState(false);
  const project = w.projects.find((p) => p.id === projectId);
  return (
    <>
      <PageTitle
        title="Story points"
        subtitle="Find stories and bugs and assign story points for any project."
      />
      <section className="move-panel project-scope">
        <label>
          Project
          <select
            aria-label="Project for story points"
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
          Stories and bugs from all assignees are included. A value of 0 counts
          as estimated.
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
        <Empty title="Choose a project">Load its stories and bugs.</Empty>
      )}
    </>
  );
}

function ProjectStories({
  project,
  onBusy,
}: {
  project: Choice;
  onBusy: (busy: boolean) => void;
}) {
  const w = useWorkspace();
  const [search, setSearch] = useState("");
  const [states, setStates] = useState(["all"]);
  const [sprints, setSprints] = useState(["all"]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [estimateFilter, setEstimateFilter] = useState("unestimated");
  const [shared, setShared] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const prefix = [w.scope, project.id];
  const metadata = useQuery({
    queryKey: ["story-points-metadata", ...prefix],
    queryFn: () => w.repo.workMetadata([project]),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const iterations = useQuery({
    queryKey: ["story-points-iterations", ...prefix],
    queryFn: () => w.repo.projectIterations(project),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const items = useQuery({
    queryKey: ["story-points-items", ...prefix],
    queryFn: async () =>
      (await w.repo.listMine("all", metadata.data!)).map((item) => ({
        ...item,
        project: item.project ?? project.name,
      })),
    enabled: !!metadata.data,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    onBusy(busy);
  }, [busy, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
  const projectConfig = metadata.data?.projectConfigs?.[project.name];
  const config = projectConfig ?? metadata.data;
  const stories = config
    ? (items.data ?? []).filter(
        (item) =>
          item.project === project.name &&
          (isStory(item, config) ||
            (projectConfig?.bugTypes ?? ["Bug"]).includes(item.type)),
      )
    : [];
  const unestimated = stories.filter((item) => item.storyPoints == null);
  const isBug = (item: WorkItem) =>
    (projectConfig?.bugTypes ?? ["Bug"]).includes(item.type);
  const filteredByEstimate =
    estimateFilter === "unestimated" ? unestimated : stories;
  const shown = filteredByEstimate.filter(
    (item) =>
      (typeFilter === "all" ||
        (typeFilter === "bugs" ? isBug(item) : !isBug(item))) &&
      (states.includes("all") || states.includes(item.state)) &&
      (sprints.includes("all") || sprints.includes(item.iteration)) &&
      (item.title.toLowerCase().includes(search.trim().toLowerCase()) ||
        String(item.id).includes(search.trim())),
  );
  const stateOptions = [
    ...new Set([
      ...(config?.storyStates ?? []),
      ...stories.map((item) => item.state),
    ]),
  ].sort();
  const sprintOptions = [
    ...new Set([
      ...(iterations.data ?? []).map((i) => i.path),
      ...stories.map((item) => item.iteration),
    ]),
  ].sort();
  const fieldFor = (item: WorkItem) =>
    projectConfig?.typeStoryPointFields &&
    item.type in projectConfig.typeStoryPointFields
      ? projectConfig.typeStoryPointFields[item.type]
      : (item.storyPointField ?? config?.storyPointField);
  const loadError = metadata.error ?? iterations.error ?? items.error;
  const loading = metadata.isPending || iterations.isPending || items.isPending;

  const refresh = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const meta = await metadata.refetch();
      await iterations.refetch();
      if (!meta.error) await items.refetch();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const applyShared = () => {
    if (!shared.trim()) return;
    setDrafts((previous) => {
      const next = { ...previous };
      for (const item of shown) if (fieldFor(item)) next[item.id] = shared;
      return next;
    });
    setErrors({});
  };
  const save = async () => {
    if (operation.current) return;
    const targets = stories.filter((item) => drafts[item.id] !== undefined);
    if (!targets.length) {
      setMessage("No story points to save.");
      return;
    }
    operation.current = true;
    setBusy(true);
    setMessage("");
    const pending = readStored(storageKey(w.scope, "work-edits"), {}, isEdits);
    const failures: Record<number, string> = {};
    let saved = 0;
    for (const story of targets) {
      try {
        const field = fieldFor(story);
        if (!field)
          throw new Error("This work item has no supported story point field.");
        if (pending[story.id])
          throw new Error(
            "Save or discard this item's unsaved My work edits before assigning points.",
          );
        const values = patchValues({ [field]: drafts[story.id] });
        const updated = await w.repo.update(story, values);
        w.replaceWorkItem({ ...story, ...updated, storyPointField: field });
        setDrafts((previous) => {
          const next = { ...previous };
          delete next[story.id];
          return next;
        });
        saved++;
      } catch (error) {
        failures[story.id] = (error as Error).message;
      }
    }
    setErrors(failures);
    setMessage(
      `Saved story points for ${saved} work item${saved === 1 ? "" : "s"}.${Object.keys(failures).length ? ` ${Object.keys(failures).length} failed; review the errors and retry.` : ""}`,
    );
    operation.current = false;
    setBusy(false);
  };
  return (
    <div className="move-stories story-points">
      <div className="move-toolbar">
        <h2>{project.name} stories and bugs</h2>
        <button
          disabled={busy || (loading && !loadError)}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {message && <Notice tone="success">{message}</Notice>}
      {loadError ? (
        <Notice tone="error">
          {loadError.message}{" "}
          <button disabled={busy} onClick={() => void refresh()}>
            Retry loading
          </button>
        </Notice>
      ) : loading ? (
        <Loading label="Loading project stories and sprints…" />
      ) : (
        <>
          {!!metadata.data?.warnings.length && (
            <Notice>{metadata.data.warnings.join(" · ")}</Notice>
          )}
          {stories.some((item) => !fieldFor(item)) && (
            <Notice>
              Some work items have no supported story point field and cannot be
              estimated.
            </Notice>
          )}
          <fieldset className="move-controls" disabled={busy}>
            <legend>Filter work items</legend>
            <label>
              Work item type
              <select
                aria-label="Filter work item type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">Stories and bugs</option>
                <option value="stories">User stories</option>
                <option value="bugs">Bugs</option>
              </select>
            </label>
            <label>
              Estimate status
              <select
                aria-label="Filter estimate status"
                value={estimateFilter}
                onChange={(e) => setEstimateFilter(e.target.value)}
              >
                <option value="unestimated">Unestimated</option>
                <option value="all">All estimates</option>
              </select>
            </label>
            <label>
              Search stories
              <input
                aria-label="Search unestimated stories"
                placeholder="Title or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Sprint
              <SearchableMultiSelect
                label="Filter sprint"
                allValue="all"
                value={sprints}
                disabled={busy}
                options={[
                  { value: "all", label: "All sprints" },
                  ...sprintOptions.map((path) => ({
                    value: path,
                    label: path,
                  })),
                ]}
                onChange={setSprints}
              />
            </label>
            <label>
              State
              <SearchableMultiSelect
                label="Filter story state"
                allValue="all"
                value={states}
                disabled={busy}
                options={[
                  { value: "all", label: "All states" },
                  ...stateOptions.map((state) => ({
                    value: state,
                    label: state,
                  })),
                ]}
                onChange={setStates}
              />
            </label>
          </fieldset>
          <section className="move-panel" aria-label="Unestimated stories">
            <div className="move-controls">
              <label>
                Shared story points
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="any"
                  aria-label="Shared story points"
                  value={shared}
                  disabled={busy}
                  onChange={(e) => setShared(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || !shared.trim() || !shown.length}
                onClick={applyShared}
              >
                Apply to shown items
              </button>
              <button
                className="primary"
                type="button"
                disabled={busy || !Object.keys(drafts).length}
                onClick={() => void save()}
              >
                {busy && <BusyIndicator />}
                {busy ? "Saving?" : "Save story points"}
              </button>
            </div>
            <p className="muted">
              Apply sets the value on shown items. Save updates all entered
              values, including items hidden by filters.
            </p>
            <p className="muted" role="status">
              Showing {shown.length} of {filteredByEstimate.length} work items
            </p>
            {!shown.length && (
              <Empty
                title={
                  filteredByEstimate.length
                    ? "No matching work items"
                    : "No work items to estimate"
                }
              >
                {filteredByEstimate.length
                  ? "Change your search or filters."
                  : "No matching stories or bugs remain in this project."}
              </Empty>
            )}
            {shown.map((story) => (
              <div
                className="story-point-row"
                key={story.id}
                aria-label={`Estimate story #${story.id}`}
              >
                <div className="story-point-summary">
                  <strong>
                    {story.url ? (
                      <a href={story.url} target="_blank" rel="noreferrer">
                        #{story.id} {story.title}
                      </a>
                    ) : (
                      `#${story.id} ${story.title}`
                    )}
                  </strong>
                  <span className="move-story-details">
                    {story.state} · {story.iteration} ·{" "}
                    {story.assignedTo || "Unassigned"}
                  </span>
                </div>
                <label>
                  Story points
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="any"
                    inputMode="decimal"
                    aria-label={`Story points for #${story.id}`}
                    aria-invalid={!!errors[story.id]}
                    aria-describedby={
                      errors[story.id]
                        ? `story-point-error-${story.id}`
                        : undefined
                    }
                    value={
                      drafts[story.id] ??
                      (story.storyPoints == null
                        ? ""
                        : String(story.storyPoints))
                    }
                    disabled={busy || !fieldFor(story)}
                    onChange={(e) => {
                      setDrafts((previous) => ({
                        ...previous,
                        [story.id]: e.target.value,
                      }));
                      setErrors((previous) => {
                        const next = { ...previous };
                        delete next[story.id];
                        return next;
                      });
                    }}
                  />
                </label>
                {errors[story.id] && (
                  <div
                    className="story-point-error"
                    id={`story-point-error-${story.id}`}
                  >
                    <Notice tone="error">
                      {errors[story.id]} <Link to="/work">Open My work</Link>
                    </Notice>
                  </div>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
