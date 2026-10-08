import { Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "../../app/Workspace";
import { storageKey, useStored } from "../../shared/storage/storage";
import { Notice, PageTitle } from "../../shared/ui/Common";
import { defaultTemplates, validTemplates, type TaskTemplate } from "./model";
export function TemplatesPage() {
  const w = useWorkspace();
  return <Templates key={w.scope} scope={w.scope} />;
}
function Templates({ scope }: { scope: string }) {
  const [templates, setTemplates, error] = useStored<TaskTemplate[]>(
    storageKey(scope, "templates"),
    defaultTemplates,
    validTemplates,
  );
  const update = (t: TaskTemplate) =>
    setTemplates((list) => list.map((x) => (x.id === t.id ? t : x)));
  return (
    <>
      <PageTitle
        title="Task templates"
        subtitle="Reusable task sets for analysis, development, testing and documentation."
        action={
          <button
            className="primary"
            onClick={() =>
              setTemplates((x) => [
                ...x,
                { id: crypto.randomUUID(), name: "New template", tasks: [] },
              ])
            }
          >
            <Plus size={16} />
            New template
          </button>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}
      {templates.map((t) => (
        <section className="panel template-card" key={t.id}>
          <div className="section-heading">
            <input
              aria-label="Template name"
              value={t.name}
              onChange={(e) => update({ ...t, name: e.target.value })}
            />
            <button
              className="icon danger"
              aria-label="Delete template"
              onClick={() => {
                if (confirm("Delete this task template?"))
                  setTemplates((x) => x.filter((a) => a.id !== t.id));
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
          {t.tasks.map((task, i) => (
            <div className="template-row" key={i}>
              <input
                aria-label={`Template task ${i + 1} title`}
                value={task.title}
                onChange={(e) =>
                  update({
                    ...t,
                    tasks: t.tasks.map((a, j) =>
                      j === i ? { ...a, title: e.target.value } : a,
                    ),
                  })
                }
              />
              <label className="hours-inline">
                <input
                  aria-label={`Template task ${i + 1} hours`}
                  type="number"
                  min="0"
                  step="0.5"
                  value={task.hours}
                  onChange={(e) =>
                    update({
                      ...t,
                      tasks: t.tasks.map((a, j) =>
                        j === i
                          ? {
                              ...a,
                              hours: Math.max(0, Number(e.target.value) || 0),
                            }
                          : a,
                      ),
                    })
                  }
                />
                h
              </label>
              <button
                className="icon danger"
                aria-label={`Remove template task ${i + 1}`}
                onClick={() =>
                  update({ ...t, tasks: t.tasks.filter((_, j) => j !== i) })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              update({ ...t, tasks: [...t.tasks, { title: "", hours: 1 }] })
            }
          >
            <Plus size={15} />
            Add task
          </button>
          <p className="muted">
            Apply this template to a story from Create stories. Changes are
            saved automatically.
          </p>
        </section>
      ))}
    </>
  );
}
