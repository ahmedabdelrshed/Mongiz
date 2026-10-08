import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Upload, ArrowRight, CheckCircle2 } from "lucide-react";
import { useWorkspace } from "../../app/Workspace";
import { Empty, Loading, Notice, PageTitle } from "../../shared/ui/Common";
import {
  defaultTaskDefinitions,
  draftSchema,
  emptyDraft,
  isDraft,
  totals,
  type Draft,
  type Results,
} from "./model";
import { resolveIteration, submitBatch } from "./submit";
import { StoryEditor } from "./StoryEditor";
import { PasteSrsPanel } from "./PasteSrsPanel";
import type { Metadata } from "../../shared/api/types";
import { fields } from "../../shared/api/types";
const emptyMeta: Metadata = {
  projects: [],
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
  taskStates: [],
  warnings: [],
};
const freshDraft = (): Draft => ({ ...emptyDraft(), stories: [] });
export function BulkCreatePage() {
  const w = useWorkspace();
  const [created, setCreated] = useState("");
  useEffect(() => {
    // Clear legacy automatic creation drafts; creation now stays in memory.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (
          key?.startsWith("taskflow:v1:") &&
          (key.endsWith(":batch") || key.includes(":results:"))
        )
          localStorage.removeItem(key);
      }
    } catch {
      // Creation does not require browser storage to be available.
    }
    return () => w.setTargetProject("");
  }, []);
  return (
    <>
      <section className="panel">
        <label>
          Destination project
          <select
            aria-label="Destination project"
            value={w.targetProject}
            onChange={(e) => {
              w.setTargetProject(e.target.value);
              setCreated("");
            }}
          >
            <option value="">Choose project for this batch</option>
            {w.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          My Work reads all projects. New stories use this project's default
          team for sprint/backlog choices.
        </p>
      </section>
      {created && (
        <Notice tone="success">
          {created} All creation fields have been cleared.
        </Notice>
      )}
      {w.creationError && (
        <Notice tone="error">
          {w.creationError.message}
          <button onClick={w.refresh}>Retry</button>
        </Notice>
      )}
      {w.creationLoading ? (
        <Loading />
      ) : (
        <BulkForm key={w.targetProject || "empty"} onCreated={setCreated} />
      )}
    </>
  );
}
function BulkForm({ onCreated }: { onCreated: (message: string) => void }) {
  const w = useWorkspace(),
    meta = w.creationMeta ?? emptyMeta;
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [resultMap, setResultMap] = useState<Results>({});
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const query = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const count = totals(draft);
  const started = Object.keys(resultMap).length > 0;
  const locked = busy || started;
  const sharedTasks = useRef<HTMLDivElement>(null);
  const features = meta.features.filter((f) => f.parentId === draft.epicId);
  let iteration = "Choose destination";
  try {
    iteration = resolveIteration(draft, meta);
  } catch {
    /* displayed in validation */
  }
  const change = (next: Draft) => {
    setDraft(next);
    setReview(false);
    setError("");
  };
  const validate = () => {
    const parsed = draftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((i) => `${i.path.join(" → ")}: ${i.message}`)
          .join(" · "),
      );
      return false;
    }
    try {
      resolveIteration(draft, meta);
      if (!features.some((f) => f.id === draft.featureId))
        throw new Error("Choose a feature under the selected Epic.");
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
    setError("");
    return true;
  };
  const saveResults = (r: Results) => setResultMap(r);
  const fresh = () => {
    setDraft(freshDraft());
    setResultMap({});
    setReview(false);
    setMessage("");
    setError("");
    w.setTargetProject("");
  };
  const submit = async () => {
    if (lock.current || !w.creationMeta || !validate()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const run = () =>
        submitBatch(draft, meta, w.creationRepo, resultMap, saveResults);
      const r = navigator.locks
        ? await navigator.locks.request(
            `mongiz:${w.scope}:${draft.batchId}`,
            run,
          )
        : await run();
      const successes = Object.values(r).filter(
        (x) => x.status === "success",
      ).length;
      const summary = `${successes} of ${count.stories + count.tasks} items created. ${w.settings.mode === "demo" ? "Saved in demo storage." : "Saved in Azure DevOps."}`;
      void query.invalidateQueries({ queryKey: ["work", w.scope] });
      void query.invalidateQueries({ queryKey: ["hours-work", w.scope] });
      if (successes === count.stories + count.tasks) {
        fresh();
        onCreated(summary);
      } else setMessage(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const exportDraft = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { format: "taskflow-batch", draft, results: resultMap },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mongiz-draft.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importDraft = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    try {
      if (selected.size > 2_000_000) throw new Error("Draft is too large.");
      const parsed = JSON.parse(await selected.text());
      if (parsed.format !== "taskflow-batch" || !isDraft(parsed.draft))
        throw new Error("Invalid Mongiz draft.");
      if (started) throw new Error("Start a new batch before importing.");
      if (Object.keys(parsed.results ?? {}).length)
        throw new Error(
          "This export contains submission history. Restore it in its original workspace; importing it here could create duplicates.",
        );
      setDraft({
        ...parsed.draft,
        batchId: crypto.randomUUID(),
        stories: parsed.draft.stories.map((s: any) => ({
          ...s,
          id: crypto.randomUUID(),
          tasks: s.tasks.map((t: any) => ({ ...t, id: crypto.randomUUID() })),
        })),
      });
      setMessage(
        "Draft imported. Check the parent Feature and assignee before creating.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
    e.target.value = "";
  };
  return (
    <>
      <PageTitle
        title="Create stories"
        subtitle="Set shared values once. Build several stories and their tasks."
        action={
          <div className="actions">
            <button onClick={exportDraft}>
              <Download size={15} />
              Export
            </button>
            <button disabled={locked} onClick={() => file.current?.click()}>
              <Upload size={15} />
              Import
            </button>
            <input
              type="file"
              accept="application/json"
              hidden
              ref={file}
              onChange={importDraft}
            />
          </div>
        }
      />
      {meta.warnings.map((x) => (
        <Notice key={x}>{x}</Notice>
      ))}
      {w.creationMeta && !meta.taskFields.includes(fields.estimate) && (
        <Notice>
          This process has no Original Estimate field. Hours stay in your local
          draft; Azure receives no hours on creation.
        </Notice>
      )}
      {!locked && (
        <PasteSrsPanel
          stories={draft.stories}
          onAdd={(items) => {
            change({
              ...draft,
              stories: [
                ...draft.stories.filter(
                  (s) => s.title.trim() || s.criteria.trim() || s.tasks.length,
                ),
                ...items,
              ],
            });
            requestAnimationFrame(() =>
              sharedTasks.current?.scrollIntoView?.({
                block: "start",
                behavior: "auto",
              }),
            );
            setMessage(
              `${items.length} SRS stories added to the draft. Shared settings applied.`,
            );
          }}
        />
      )}
      <section className="panel shared-panel">
        <div className="section-heading">
          <h2>Shared settings</h2>
          <span className="pill">Applied to all stories</span>
        </div>
        <div className="form-grid four">
          <label>
            Epic
            <select
              aria-label="Epic"
              disabled={locked}
              value={draft.epicId}
              onChange={(e) =>
                change({ ...draft, epicId: e.target.value, featureId: "" })
              }
            >
              <option value="">Choose Epic</option>
              {meta.epics.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Parent Feature
            <select
              aria-label="Parent Feature"
              disabled={locked || !draft.epicId}
              value={draft.featureId}
              onChange={(e) => change({ ...draft, featureId: e.target.value })}
            >
              <option value="">Choose Feature</option>
              {features.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assign all to
            <select
              aria-label="Assign all to"
              disabled={locked}
              value={draft.assignee}
              onChange={(e) => change({ ...draft, assignee: e.target.value })}
            >
              <option value="">Unassigned</option>
              {meta.people.map((p) => (
                <option key={p.id} value={p.identity}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destination
            <select
              aria-label="Destination"
              disabled={locked}
              value={draft.destination}
              onChange={(e) =>
                change({
                  ...draft,
                  destination: e.target.value as Draft["destination"],
                })
              }
            >
              <option value="current">Current sprint</option>
              <option value="backlog">Backlog</option>
              <option value="specific">Choose sprint</option>
            </select>
          </label>
        </div>
        {draft.destination === "specific" && (
          <label className="iteration-select">
            Sprint
            <select
              aria-label="Sprint"
              value={draft.iterationId}
              disabled={locked}
              onChange={(e) =>
                change({ ...draft, iterationId: e.target.value })
              }
            >
              <option value="">Select sprint</option>
              {meta.iterations.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="shared-task-section" ref={sharedTasks}>
          <h3>Default task assignees and estimates</h3>
          <p className="muted">
            Change shared owners and hours to update all inherited tasks of that
            type. Individual overrides stay unchanged.
          </p>
          <div className="form-grid three">
            {defaultTaskDefinitions.map((t) => (
              <div className="default-task-setting" key={t.key}>
                <span>{t.label}</span>
                <div className="default-task-controls">
                  <select
                    aria-label={`Shared assignee — ${t.label}`}
                    disabled={locked}
                    value={draft.taskAssignees?.[t.key] ?? "inherit"}
                    onChange={(e) =>
                      change({
                        ...draft,
                        taskAssignees: {
                          ...draft.taskAssignees,
                          [t.key]: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="inherit">Same as story assignee</option>
                    <option value="">Unassigned</option>
                    {meta.people.map((p) => (
                      <option key={p.id} value={p.identity}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <label className="shared-hours">
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      step="0.1"
                      aria-label={`Shared estimate — ${t.label}`}
                      disabled={locked}
                      value={draft.taskEstimates?.[t.key] ?? t.hours}
                      onChange={(e) =>
                        change({
                          ...draft,
                          taskEstimates: {
                            ...draft.taskEstimates,
                            [t.key]: Number(e.target.value) || 0,
                          },
                        })
                      }
                    />
                    h
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="shared-note">
          <CheckCircle2 size={15} />
          <span>
            Stories and tasks inherit the selected destination. Task assignees
            can be overridden. <strong>{iteration}</strong>
          </span>
        </div>
      </section>
      {draft.stories.map((story, index) => (
        <StoryEditor
          pointsSupported={!!meta.storyPointField}
          key={story.id}
          story={story}
          index={index}
          people={meta.people}
          assignee={draft.assignee}
          taskAssignees={draft.taskAssignees}
          taskEstimates={draft.taskEstimates}
          sprint={iteration}
          results={resultMap}
          disabled={locked}
          firstTasks={draft.stories[0]?.tasks ?? []}
          onRemove={() =>
            change({
              ...draft,
              stories: draft.stories.filter((s) => s.id !== story.id),
            })
          }
          onChange={(s) =>
            change({
              ...draft,
              stories: draft.stories.map((x) => (x.id === s.id ? s : x)),
            })
          }
        />
      ))}
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {review && !started && (
        <section className="panel review">
          <h2>Review batch</h2>
          <p>
            <strong>
              {count.stories} {meta.storyType.toLowerCase()}s + {count.tasks}{" "}
              tasks
            </strong>{" "}
            under {meta.features.find((f) => f.id === draft.featureId)?.name}
          </p>
          <p>
            Destination: <strong>{iteration}</strong> · {count.hours} estimated
            hours
          </p>
          <p className="muted">
            {w.settings.mode === "demo"
              ? "Creates local demo items only."
              : "Creates work items in Azure under your signed-in identity. Stories and tasks receive no tags or Remaining Work hours. Task hours are sent only to Original Estimate when supported."}
          </p>
        </section>
      )}
      {Object.entries(resultMap)
        .filter(([, r]) => r.status === "uncertain")
        .map(([id, r]) => (
          <Notice key={id}>
            Uncertain item: {r.message}{" "}
            <button
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Only continue if you checked Azure and confirmed this item was NOT created. Retry can otherwise duplicate it.",
                  )
                )
                  saveResults({
                    ...resultMap,
                    [id]: {
                      status: "failed",
                      message: "User confirmed no item was created.",
                    },
                  });
              }}
            >
              I verified it was not created
            </button>
          </Notice>
        ))}
      <footer className="batch-footer">
        <div>
          <strong>
            {count.stories} stories <span>·</span> {count.tasks} tasks
          </strong>
          <div className="muted">
            {count.hours} estimated hours · Creation fields are not stored
          </div>
        </div>
        <div className="actions">
          <button disabled={busy} onClick={fresh}>
            New batch
          </button>
          {started ? (
            <button
              className="primary"
              disabled={
                busy ||
                Object.values(resultMap).filter((r) => r.status === "success")
                  .length ===
                  count.stories + count.tasks
              }
              onClick={() => void submit()}
            >
              {busy ? "Creating…" : "Retry / reconcile incomplete items"}
            </button>
          ) : review ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy
                ? "Creating…"
                : `Create ${count.stories} stories + ${count.tasks} tasks`}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => {
                if (validate()) setReview(true);
              }}
            >
              Review batch
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </footer>
    </>
  );
}
