import { useState } from "react";
import { Copy } from "lucide-react";
import type { WorkItem } from "../../shared/api/types";
import { BusyIndicator } from "../../shared/ui/Common";
import { Modal } from "../../shared/ui/Dialog";
import { taskHourCategory } from "./fillSprintHours";

export function CopyImplementationTasks({
  tasks,
  disabled = false,
}: {
  tasks: WorkItem[];
  disabled?: boolean;
}) {
  const [copying, setCopying] = useState(false);
  const [copiedText, setCopiedText] = useState("");
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const implementationTasks = tasks.filter(
    (task) => taskHourCategory(task.title) === "implementation",
  );
  const text = implementationTasks.map((task) => `#${task.id}`).join(" ");
  const copy = async () => {
    if (!text) return;
    setCopying(true);
    setCopiedText("");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
    } catch {
      setManualCopy(text);
    } finally {
      setCopying(false);
    }
  };
  return (
    <>
      <button
        type="button"
        disabled={disabled || copying || !text}
        aria-busy={copying}
        title={
          text
            ? `Copy ${implementationTasks.length} selected implementation task IDs, separated by spaces, for your pull request.`
            : "Select a task with implement or implementation in its title."
        }
        onClick={() => void copy()}
      >
        {copying ? <BusyIndicator /> : <Copy size={15} aria-hidden="true" />}
        Copy implementation tasks for PR
      </button>
      {copiedText && copiedText === text && (
        <p className="muted" role="status">
          Copied {implementationTasks.length} implementation{" "}
          {implementationTasks.length === 1 ? "task" : "tasks"}. Paste into your
          pull request description.
        </p>
      )}
      <Modal
        open={manualCopy !== null}
        onOpenChange={(open) => {
          if (!open) setManualCopy(null);
        }}
        title="Copy implementation tasks"
        description="Clipboard access is unavailable. Copy the text below and paste it into your pull request description."
      >
        <label>
          Pull request task text
          <textarea
            readOnly
            autoFocus
            rows={8}
            value={manualCopy ?? ""}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={() => setManualCopy(null)}>
            Done
          </button>
        </div>
      </Modal>
    </>
  );
}
