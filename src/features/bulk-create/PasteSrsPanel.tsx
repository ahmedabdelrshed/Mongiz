import { useMemo, useState } from "react";
import { ClipboardPaste, Plus } from "lucide-react";
import { Notice } from "../../shared/ui/Common";
import { copyTasks, defaultTasks, type StoryDraft } from "./model";
import { parseSrs, srsCode } from "./parseSrs";
export function PasteSrsPanel({
  stories,
  onAdd,
}: {
  stories: StoryDraft[];
  onAdd: (items: StoryDraft[]) => void;
}) {
  const [text, setText] = useState(""),
    [taskMode, setTaskMode] = useState("standard"),
    [error, setError] = useState("");
  const parsed = useMemo(() => parseSrs(text), [text]);
  const existing = new Set(
    stories.map((s) => srsCode(s.title)).filter(Boolean),
  );
  const duplicates = parsed.stories
    .map((s) => srsCode(s.title))
    .filter((code) => code && existing.has(code));
  const apply = () => {
    if (parsed.error || !parsed.stories.length || duplicates.length) return;
    onAdd(
      parsed.stories.map((s) => ({
        ...s,
        tasks:
          taskMode === "standard"
            ? defaultTasks()
            : taskMode === "copy"
              ? copyTasks(stories[0]?.tasks ?? [])
              : [],
      })),
    );
    setText("");
    setTaskMode("standard");
  };
  return (
    <section className="panel paste-panel" aria-label="Paste SRS stories">
      <div className="section-heading">
        <h2>
          <ClipboardPaste size={18} />
          Paste SRS stories
        </h2>
      </div>
      <label>
        Requirements text
        <textarea
          aria-label="Paste SRS requirements"
          rows={7}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
          placeholder={
            "SRS.7.7.48: Create Transform Work Order\nThe user can select multiple work standards.\n\nSRS.7.7.49: Show inactive work standards\nDisplay an indicator for inactive records."
          }
        />
      </label>
      <p className="muted paste-help">
        Start each story on a new line with SRS and its number. All text up to
        the next SRS identifier becomes one title. Line breaks become spaces;
        the description stays empty.
      </p>
      {text.trim() && parsed.error && (
        <Notice tone="error">{parsed.error}</Notice>
      )}
      {duplicates.length > 0 && (
        <Notice tone="error">
          Already in this batch: {duplicates.join(", ")}. Remove these
          identifiers from the paste box to avoid duplicate stories.
        </Notice>
      )}
      {parsed.warnings.map((message) => (
        <Notice key={message}>{message}</Notice>
      ))}
      {!parsed.error && parsed.stories.length > 0 && (
        <div className="paste-preview">
          <h3>{parsed.stories.length} stories detected</h3>
          <ol>
            {parsed.stories.map((s) => (
              <li key={s.id}>
                <strong>{s.title}</strong>
                {s.criteria && <p>{s.criteria}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
      <label className="paste-task-choice">
        Tasks for pasted stories
        <select
          aria-label="Tasks for pasted stories"
          value={taskMode}
          onChange={(e) => setTaskMode(e.target.value)}
        >
          <option value="standard">
            Nine default development / testing tasks
          </option>
          <option value="copy" disabled={!stories[0]?.tasks.length}>
            Copy tasks from the first story
          </option>
          <option value="none">No tasks</option>
        </select>
      </label>
      {taskMode === "standard" && (
        <p className="muted paste-help">
          Each story gets frontend/backend implementation (0.5h each), linking,
          static analysis, code review and unit testing (0.1h each). Owners and
          hours inherit the shared settings at the top.
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="actions">
        <button
          className="primary"
          disabled={
            !text.trim() ||
            !!parsed.error ||
            !parsed.stories.length ||
            duplicates.length > 0
          }
          onClick={apply}
        >
          <Plus size={16} />
          Add {parsed.stories.length || ""} stories to batch
        </button>
        <button onClick={() => setText("")}>Clear text</button>
      </div>
      <p className="muted paste-help">
        Adds local drafts only. Shared parent, assignee and sprint/backlog
        settings apply to every added story.
      </p>
    </section>
  );
}
