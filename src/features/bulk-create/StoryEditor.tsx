import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Person } from "../../shared/api/types";
import {
  copyTasks,
  newTask,
  effectiveAssignee,
  effectiveHours,
  type Draft,
  type StoryDraft,
  type Results,
} from "./model";
export function StoryEditor({
  story,
  index,
  people,
  assignee,
  taskAssignees,
  taskEstimates,
  sprint,
  results,
  disabled,
  onChange,
  onRemove,
  firstTasks,
  pointsSupported,
}: {
  pointsSupported: boolean;
  story: StoryDraft;
  index: number;
  people: Person[];
  assignee: string;
  taskAssignees: Draft["taskAssignees"];
  taskEstimates: Draft["taskEstimates"];
  sprint: string;
  results: Results;
  disabled: boolean;
  onChange: (s: StoryDraft) => void;
  onRemove: () => void;
  firstTasks: StoryDraft["tasks"];
}) {
  const [expanded, setExpanded] = useState(true);
  const result = results[story.id];
  return (
    <section className="story-card">
      <header className="story-head">
        <button
          type="button"
          className="icon"
          aria-label={`${expanded ? "Collapse" : "Expand"} story ${index + 1}`}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown
            size={18}
            style={{ transform: expanded ? "none" : "rotate(-90deg)" }}
          />
        </button>
        <span className="type-badge">STORY {index + 1}</span>
        <input
          aria-label={`Story ${index + 1} title`}
          className="story-title"
          placeholder="What should the user be able to do?"
          value={story.title}
          disabled={disabled}
          onChange={(e) => onChange({ ...story, title: e.target.value })}
        />
        <button
          type="button"
          className="icon danger"
          disabled={disabled}
          aria-label={`Remove story ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </header>
      <div className="story-meta">
        {people.find((p) => p.identity === assignee)?.name ||
          assignee ||
          "Unassigned"}{" "}
        <span>·</span> {sprint} <span>·</span> {story.tasks.length} tasks
        {result && (
          <span className={`result ${result.status}`}>
            {result.status === "success"
              ? `Created #${result.azureId}`
              : result.status}
          </span>
        )}
      </div>
      {result?.message && <p className="result-message">{result.message}</p>}
      {expanded && (
        <div className="story-body">
          <label>
            Story points
            <input
              type="number"
              min="0"
              max="10000"
              step="0.5"
              aria-label={`Story ${index + 1} points`}
              disabled={disabled || !pointsSupported}
              value={story.storyPoints ?? ""}
              onChange={(e) =>
                onChange({
                  ...story,
                  storyPoints:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
            {!pointsSupported && (
              <span className="muted">
                This process has no supported points field.
              </span>
            )}
          </label>
          <label className="criteria">
            Description / acceptance criteria
            <textarea
              rows={2}
              placeholder="What does successful completion look like?"
              disabled={disabled}
              value={story.criteria}
              onChange={(e) => onChange({ ...story, criteria: e.target.value })}
            />
          </label>
          <div className="task-labels">
            <span>Task title</span>
            <span>Assigned to</span>
            <span>Hours</span>
            <span />
          </div>
          {story.tasks.map((task, i) => (
            <div key={task.id}>
              <div className="task-row">
                <input
                  aria-label={`Story ${index + 1} task ${i + 1} title`}
                  disabled={disabled}
                  placeholder="Task title"
                  value={task.title}
                  onChange={(e) =>
                    onChange({
                      ...story,
                      tasks: story.tasks.map((t) =>
                        t.id === task.id ? { ...t, title: e.target.value } : t,
                      ),
                    })
                  }
                />
                <select
                  aria-label={`Story ${index + 1} task ${i + 1} assignee`}
                  disabled={disabled}
                  value={task.assignee}
                  onChange={(e) =>
                    onChange({
                      ...story,
                      tasks: story.tasks.map((t) =>
                        t.id === task.id
                          ? { ...t, assignee: e.target.value }
                          : t,
                      ),
                    })
                  }
                >
                  <option value="inherit">
                    {task.defaultTaskKey
                      ? "Shared task assignee"
                      : "Same assignee"}{" "}
                    ·{" "}
                    {people.find(
                      (p) =>
                        p.identity ===
                        effectiveAssignee(
                          { ...task, assignee: "inherit" },
                          { assignee, taskAssignees },
                        ),
                    )?.name ||
                      effectiveAssignee(
                        { ...task, assignee: "inherit" },
                        { assignee, taskAssignees },
                      ) ||
                      "Unassigned"}
                  </option>
                  <option value="">Unassigned</option>
                  {people.map((p) => (
                    <option value={p.identity} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="task-estimate">
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="0.1"
                    disabled={disabled}
                    aria-label={`Story ${index + 1} task ${i + 1} hours`}
                    value={effectiveHours(task, { taskEstimates })}
                    onChange={(e) =>
                      onChange({
                        ...story,
                        tasks: story.tasks.map((t) =>
                          t.id === task.id
                            ? {
                                ...t,
                                inheritEstimate: false,
                                hours:
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value),
                              }
                            : t,
                        ),
                      })
                    }
                  />
                  {task.defaultTaskKey && (
                    <button
                      type="button"
                      className="estimate-inheritance"
                      disabled={disabled || task.inheritEstimate === true}
                      aria-label={`Restore shared estimate for story ${index + 1} task ${i + 1}`}
                      onClick={() =>
                        onChange({
                          ...story,
                          tasks: story.tasks.map((t) =>
                            t.id === task.id
                              ? { ...t, inheritEstimate: true }
                              : t,
                          ),
                        })
                      }
                    >
                      {task.inheritEstimate === true ? "Shared" : "Reset"}
                    </button>
                  )}
                </div>
                <button
                  className="icon danger"
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove story ${index + 1} task ${i + 1}`}
                  onClick={() =>
                    onChange({
                      ...story,
                      tasks: story.tasks.filter((t) => t.id !== task.id),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {results[task.id] && (
                <p className={`task-result result ${results[task.id].status}`}>
                  {results[task.id].status === "success"
                    ? `Created #${results[task.id].azureId}`
                    : (results[task.id].message ?? results[task.id].status)}
                </p>
              )}
            </div>
          ))}
          <div className="story-actions">
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange({ ...story, tasks: [...story.tasks, newTask()] })
              }
            >
              <Plus size={15} />
              Add task
            </button>
            {index > 0 && (
              <button
                type="button"
                disabled={disabled || !firstTasks.length}
                onClick={() =>
                  onChange({
                    ...story,
                    tasks: [...story.tasks, ...copyTasks(firstTasks)],
                  })
                }
              >
                <Copy size={15} />
                Copy tasks from first story
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
