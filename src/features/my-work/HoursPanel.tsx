import { useEffect } from "react";
import { useWorkspace } from "../../app/Workspace";
import { BusyIndicator, Loading, Notice } from "../../shared/ui/Common";
import { effective, type Edits } from "./edits";
import { HoursSummary } from "./HoursSummary";
import type { SprintTarget } from "./filters";

export function HoursPanel({
  edits,
  target,
  setTarget,
}: {
  edits: Edits;
  target: SprintTarget;
  setTarget: (target: SprintTarget) => void;
}) {
  const w = useWorkspace();
  // Request all-project hours once for this account/organization, independently
  // of the selected list projects and their query cache.
  useEffect(() => {
    w.requestHours();
  }, [w.scope]);
  if (w.settings.mode === "azure" && !w.account) return null;
  if (w.settings.mode === "demo" && (!w.hoursMeta || !w.hours.data))
    return null;
  if (w.hoursError)
    return (
      <Notice tone="error">
        Could not calculate hours across all projects: {w.hoursError.message}
        <button onClick={w.refreshHours}>Retry hour loading</button>
      </Notice>
    );
  if (!w.hoursMeta || !w.hours.data)
    return (
      <Loading
        label="Loading hour totals across all accessible projects…"
        description="Gathering estimates and completed hours for your sprint overview."
      />
    );
  return (
    <>
      <HoursSummary
        items={w.hours.data
          .filter((i) => i.isTask ?? i.type === w.hoursMeta!.taskType)
          .map((i) => effective(i, edits))}
        iterations={w.hoursMeta.iterations}
        target={target}
        setTarget={setTarget}
        owner={w.settings.mode === "demo" ? "ahmed@example.com" : w.account}
        people={w.hoursMeta.people}
        actions={
          <>
            <button
              disabled={w.hours.isFetching}
              aria-busy={w.hours.isFetching}
              onClick={w.refreshHours}
            >
              {w.hours.isFetching && <BusyIndicator />}
              {w.hours.isFetching
                ? "Refreshing hours…"
                : "Refresh all-project hours"}
            </button>
            {w.hoursMeta.warnings.map((warning, index) => (
              <Notice key={index}>Hour calculation metadata: {warning}</Notice>
            ))}
          </>
        }
      />
    </>
  );
}
