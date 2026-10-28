import { useState } from "react";
import { useWorkspace } from "../../app/Workspace";
import type { PullRequest, WorkItem } from "../../shared/api/types";
import { Modal } from "../../shared/ui/Dialog";
import { taskHourCategory } from "./fillSprintHours";

export function LinkPullRequest({
  tasks,
  disabled,
}: {
  tasks: WorkItem[];
  disabled?: boolean;
}) {
  const w = useWorkspace();
  const items = tasks.filter(
    (task) => taskHourCategory(task.title) === "implementation",
  );
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState("");
  const [requests, setRequests] = useState<PullRequest[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<string[]>([]);

  async function loadProject(value: string) {
    setProject(value);
    setSelected("");
    setRequests([]);
    setResults([]);
    setError("");
    if (!value || !w.repo.listPullRequests) return;
    setLoading(true);
    try {
      const prs = await w.repo.listPullRequests(value);
      setRequests(prs);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load pull requests.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function link() {
    const pr = requests.find((request) => String(request.id) === selected);
    if (!pr || !w.repo.linkPullRequest) return;
    setBusy(true);
    setError("");
    setResults([]);
    const lines: string[] = [];
    for (const item of items) {
      try {
        const result = await w.repo.linkPullRequest(item, pr);
        w.replaceWorkItem(result.item);
        lines.push(
          `#${item.id}: ${result.alreadyLinked ? "Already linked" : "Linked"}`,
        );
      } catch (e) {
        lines.push(
          `#${item.id}: ${e instanceof Error ? e.message : "Could not link"}`,
        );
      }
      setResults([...lines]);
    }
    setBusy(false);
  }
  return (
    <>
      <button
        type="button"
        disabled={
          disabled ||
          !items.length ||
          !w.repo.listPullRequests ||
          !w.repo.linkPullRequest
        }
        onClick={() => setOpen(true)}
      >
        Link implementation tasks to PR
      </button>
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!busy && !loading) setOpen(value);
        }}
        title="Link implementation tasks to pull request"
        description={`Link ${items.length} selected implementation ${items.length === 1 ? "task" : "tasks"} to an active pull request.`}
      >
        <label>
          Pull request project
          <select
            value={project}
            disabled={busy || loading}
            onChange={(event) => void loadProject(event.target.value)}
          >
            <option value="">Choose a project</option>
            {w.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {loading && <p role="status">Loading pull requests…</p>}
        {project && !loading && (
          <label>
            Pull request
            <select
              value={selected}
              disabled={busy || !requests.length}
              onChange={(event) => {
                setSelected(event.target.value);
                setResults([]);
              }}
            >
              <option value="">
                {requests.length
                  ? "Choose a pull request"
                  : "No active pull requests found"}
              </option>
              {requests.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  #{pr.id} · {pr.repository} · {pr.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert">
            {error} Check Code (Read) and Work Items (Read &amp; write) access.
          </p>
        )}
        {results.length > 0 && (
          <div role="status">
            {results.map((result) => (
              <p key={result}>{result}</p>
            ))}
          </div>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            disabled={busy || loading || !selected}
            onClick={() => void link()}
          >
            {busy ? "Linking…" : "Link tasks"}
          </button>
        </div>
      </Modal>
    </>
  );
}
