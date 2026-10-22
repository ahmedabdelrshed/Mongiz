import { Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "../../app/Workspace";
import { storageKey, useStored } from "../../shared/storage/storage";
import { Notice, PageTitle } from "../../shared/ui/Common";
import { defaultTemplates, validTemplates, type TaskTemplate } from "./model";
import { motion } from "framer-motion";
import { Disclosure, fade } from "../../shared/ui/Motion";
import { ConfirmButton } from "../../shared/ui/Dialog";
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
      {!templates.length && (
        <div className="empty">
          <h3>No task templates yet</h3>
          <p>Create a reusable set of tasks for your next story.</p>
        </div>
      )}
      {templates.map((t, index) => (
        <motion.section
          className="panel template-card"
          key={t.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={fade}
        >
          <div className="template-heading">
            <h2>{t.name || "Untitled template"}</h2>
            <span className="muted">
              {t.tasks.length} tasks ·{" "}
              {Number(
                t.tasks.reduce((sum, task) => sum + task.hours, 0).toFixed(2),
              )}
              h
            </span>
            <ConfirmButton
              className="icon danger"
              label={`Delete template: ${t.name}`}
              title="Delete this task template?"
              description={`“${t.name}” will be removed from this browser. Existing story tasks are kept.`}
              confirmLabel="Delete template"
              onConfirm={() => {
                setTemplates((x) => x.filter((a) => a.id !== t.id));
              }}
            >
              <Trash2 size={17} />
            </ConfirmButton>
          </div>
          <Disclosure
            title="Edit template"
            defaultOpen={index === 0 || !t.tasks.length}
          >
            <label className="template-name">
              Template name
              <input
                aria-label="Template name"
                value={t.name}
                onChange={(e) => update({ ...t, name: e.target.value })}
              />
            </label>
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
          </Disclosure>
        </motion.section>
      ))}
    </>
  );
}
