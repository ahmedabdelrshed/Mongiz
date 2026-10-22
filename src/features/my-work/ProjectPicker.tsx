import { useEffect, useState } from "react";
import { useWorkspace } from "../../app/Workspace";
import { Reveal } from "../../shared/ui/Motion";

export function ProjectPicker({ disabled = false }: { disabled?: boolean }) {
  const w = useWorkspace();
  const [ids, setIds] = useState(w.selectedWorkProjectIds);
  const [open, setOpen] = useState(!w.workProjects.length);
  const selectedKey = w.selectedWorkProjectIds.join("|");
  useEffect(() => setIds(w.selectedWorkProjectIds), [selectedKey]);
  const available = ids.filter((id) => w.projects.some((p) => p.id === id));
  return (
    <section className="project-picker" aria-label="My project selection">
      <div>
        <h2>My projects</h2>
        <p className="muted">
          {w.workProjects.length
            ? `Loading only: ${w.workProjects.map((p) => p.name).join(", ")}.`
            : "Select your projects from the projects your token can access."}{" "}
          Hour totals include all accessible projects.
        </p>
      </div>
      {disabled && <p className="muted">Please wait until saving finishes.</p>}
      {w.workProjects.length > 0 && (
        <button
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Cancel project selection" : "Change my projects"}
        </button>
      )}
      <Reveal open={open}>
        <fieldset disabled={disabled}>
          <legend>Projects to load</legend>
          {!w.projects.length && (
            <p>
              No accessible projects found. Check your organization and project
              access in Settings.
            </p>
          )}
          <div className="actions">
            {w.projects.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  aria-label={`Load project ${p.name}`}
                  checked={ids.includes(p.id)}
                  onChange={(e) =>
                    setIds((previous) =>
                      e.target.checked
                        ? [...previous, p.id]
                        : previous.filter((id) => id !== p.id),
                    )
                  }
                />{" "}
                {p.name}
              </label>
            ))}
          </div>
          <button
            className="primary"
            disabled={!available.length}
            onClick={() => {
              w.setWorkProjectIds(available);
              setOpen(false);
            }}
          >
            Load selected projects
          </button>
        </fieldset>
      </Reveal>
    </section>
  );
}
