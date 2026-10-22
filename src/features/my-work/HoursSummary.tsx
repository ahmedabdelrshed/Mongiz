import { useEffect, useState } from "react";
import type { Iteration, WorkItem } from "../../shared/api/types";
import {
  hourTotals,
  uniqueSprints,
  owns,
  isSprintTarget,
  type SprintTarget,
  iterationContainsDay,
  itemsInSprints,
} from "./filters";
import { SearchableMultiSelect } from "../../shared/ui/SearchableMultiSelect";
export function HoursSummary({
  items,
  iterations,
  target,
  setTarget,
  owner,
  people,
}: {
  items: WorkItem[];
  iterations: Iteration[];
  owner: string;
  people: import("../../shared/api/types").Person[];
  target: SprintTarget;
  setTarget: (target: SprintTarget) => void;
}) {
  const [today, setToday] = useState(() => new Date());
  const [showMonths, setShowMonths] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const updateDay = () => {
      const now = new Date();
      setToday(now);
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      clearTimeout(timer);
      timer = setTimeout(updateDay, midnight.getTime() - now.getTime() + 20);
    };
    updateDay();
    window.addEventListener("focus", updateDay);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", updateDay);
    };
  }, []);
  const [selectedSprints, setSelectedSprints] = useState(["current"]);
  const [selectedMonths, setSelectedMonths] = useState(["current"]);
  const [user, setUser] = useState("mine");
  const [selectedProjects, setSelectedProjects] = useState(["all"]);
  const projectFor = (item: WorkItem) =>
    item.project ??
    iterations.find((iteration) => iteration.path === item.iteration)?.project;
  const projectNames = [
    ...new Set(
      [
        ...iterations.map((iteration) => iteration.project),
        ...items.map(projectFor),
      ].filter((project): project is string => !!project),
    ),
  ].sort();
  const includesProject = (project?: string) =>
    selectedProjects.includes("all") ||
    (!!project && selectedProjects.includes(project));
  const availableIterations = iterations.filter((iteration) =>
    includesProject(iteration.project),
  );
  const calculationItems = items.filter(
    (item) => owns(item, user, owner) && includesProject(projectFor(item)),
  );
  const users = [
    ...new Set([
      ...people.map((p) => p.identity),
      ...items.map((i) => i.assignedTo).filter(Boolean),
    ]),
  ].sort();
  const [minimum, setMinimum] = useState(String(target.min));
  const [maximum, setMaximum] = useState(String(target.max));
  const updateTarget = (side: "min" | "max", value: string) => {
    if (side === "min") setMinimum(value);
    else setMaximum(value);
    const min = side === "min" ? value : minimum;
    const max = side === "max" ? value : maximum;
    const next = { min: Number(min), max: Number(max) };
    if (min !== "" && max !== "" && isSprintTarget(next)) setTarget(next);
  };
  const invalid =
    minimum === "" ||
    maximum === "" ||
    !isSprintTarget({ min: Number(minimum), max: Number(maximum) });
  const availableSprints = uniqueSprints(availableIterations);
  const selected = availableSprints.filter(
    (iteration) =>
      selectedSprints.includes("all") ||
      (selectedSprints.includes("current") &&
        iterationContainsDay(iteration, today)) ||
      selectedSprints.includes(iteration.path),
  );
  const currentOnly =
    selectedSprints.length === 1 && selectedSprints[0] === "current";
  const selectedItems = itemsInSprints(calculationItems, selected);
  const itemsByProject = new Map<string, WorkItem[]>();
  for (const iteration of selected) {
    if (iteration.project) itemsByProject.set(iteration.project, []);
  }
  for (const item of selectedItems) {
    const name = projectFor(item) ?? "Unknown project";
    const projectItems = itemsByProject.get(name) ?? [];
    projectItems.push(item);
    itemsByProject.set(name, projectItems);
  }
  const dateLabel = today.toLocaleDateString("en-GB");
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const availableMonths = [
    ...new Set(
      availableSprints.flatMap((iteration) =>
        iteration.startDate ? [iteration.startDate.slice(0, 7)] : [],
      ),
    ),
  ].sort();
  const selectedMonthValues = [
    ...new Set(
      selectedMonths.includes("all")
        ? availableMonths
        : [
            ...(selectedMonths.includes("current") ? [currentMonth] : []),
            ...selectedMonths.filter((month) => month !== "current"),
          ],
    ),
  ];
  const iterationsForMonth = (month: string) =>
    availableSprints.filter(
      (iteration) => iteration.startDate?.slice(0, 7) === month,
    );
  const monthTitle = (month: string) =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const titleFor = (iteration: Iteration) =>
    iteration.project
      ? `${iteration.project} · ${iteration.name}`
      : iteration.name;
  const bounds = (factor: number) => ({
    min: target.min * factor,
    max: target.max * factor,
  });
  return (
    <section
      className="hours-summary hours-summary-compact"
      aria-label="Sprint and month hours"
    >
      <h2>Hour calculations</h2>
      <div className="toolbar">
        <select
          aria-label="Calculation user"
          value={user}
          onChange={(e) => setUser(e.target.value)}
        >
          <option value="mine">My hours ({owner})</option>
          <option value="all">All users</option>
          {users
            .filter((u) => u !== owner)
            .map((u) => (
              <option key={u} value={u}>
                {people.find((p) => p.identity === u)?.name ?? u}
              </option>
            ))}
        </select>
        <SearchableMultiSelect
          label="Calculation projects"
          options={[
            { value: "all", label: "All accessible projects" },
            ...projectNames.map((project) => ({
              value: project,
              label: project,
            })),
          ]}
          value={selectedProjects}
          allValue="all"
          onChange={(value) => {
            setSelectedProjects(value);
            setSelectedSprints(["current"]);
            setSelectedMonths(["current"]);
          }}
        />
        <SearchableMultiSelect
          label="Calculation sprints"
          options={[
            { value: "all", label: "All available sprints" },
            { value: "current", label: "Current sprints" },
            ...availableSprints.map((iteration) => ({
              value: iteration.path,
              label: titleFor(iteration),
            })),
          ]}
          value={selectedSprints}
          allValue="all"
          onChange={setSelectedSprints}
        />
        <SearchableMultiSelect
          label="Calculation months"
          options={[
            { value: "all", label: "All available months" },
            { value: "current", label: "Current month" },
            ...availableMonths.map((month) => ({
              value: month,
              label: monthTitle(month),
            })),
          ]}
          value={selectedMonths}
          allValue="all"
          onChange={(value) => {
            setSelectedMonths(value);
            setShowMonths(true);
          }}
        />
      </div>
      <div className="hours-settings">
        <strong>Capacity target per sprint</strong>
        <label>
          Minimum hours
          <input
            aria-label="Sprint target minimum"
            type="number"
            step="0.01"
            min="0"
            max={target.max}
            value={minimum}
            onChange={(e) => updateTarget("min", e.target.value)}
          />
        </label>
        <label>
          Maximum hours
          <input
            aria-label="Sprint target maximum"
            type="number"
            step="0.01"
            min={target.min}
            max="10000"
            value={maximum}
            onChange={(e) => updateTarget("max", e.target.value)}
          />
        </label>
      </div>
      {invalid && (
        <p role="alert">
          Enter a valid target from 0 to 10,000 hours with minimum no greater
          than maximum. Bars use the last valid target.
        </p>
      )}
      <div className="hours-cards hours-current">
        <HourBar
          title={currentOnly ? "Current sprint" : "Selected sprints"}
          items={selectedItems}
          target={bounds(1)}
          available={!!selected.length}
          unavailable={
            currentOnly
              ? `No sprint date range contains ${dateLabel}. Configure sprint start and finish dates.`
              : "Choose a sprint with metadata to calculate hours."
          }
        />
      </div>
      <p className="muted">
        {currentOnly
          ? `Sprints containing today (${dateLabel})`
          : "Selected sprints"}
        : {selected.length}.{" "}
        {selectedProjects.includes("all")
          ? "Across all accessible projects"
          : "Across selected projects"}
        . The capacity target applies once to the combined total.
      </p>
      {itemsByProject.size > 0 && (
        <section aria-label="Hours by project">
          <h3>By project</h3>
          <div className="hours-cards">
            {[...itemsByProject]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, projectItems]) => (
                <HourBar
                  key={name}
                  title={name}
                  items={projectItems}
                  target={bounds(1)}
                  available
                  unavailable=""
                  breakdown
                />
              ))}
          </div>
        </section>
      )}
      <details
        open={showMonths}
        onToggle={(event) => setShowMonths(event.currentTarget.open)}
      >
        <summary>Month totals</summary>
        <div className="hours-cards">
          {selectedMonthValues.length ? (
            selectedMonthValues.map((month) => {
              const monthIterations = iterationsForMonth(month);
              return (
                <HourBar
                  key={month}
                  title={`Month · ${monthTitle(month)}`}
                  items={itemsInSprints(calculationItems, monthIterations)}
                  // A month represents four sprint-capacity periods.
                  target={bounds(4)}
                  available={!!monthIterations.length}
                  unavailable="No configured sprints start in this month."
                />
              );
            })
          ) : (
            <HourBar
              title="Months"
              items={[]}
              target={bounds(1)}
              available={false}
              unavailable="No months are available from the selected projects."
            />
          )}
        </div>
      </details>
      <p className="muted">
        Totals include pending local task edits across all accessible projects.
        Local closures update completed hours immediately. User and sprint
        controls are independent of the list filters. Save writes changes to
        Azure; Discard restores saved values. Current sprint totals include only
        sprints whose start and finish dates contain today, including both
        boundary days. Month totals separately include whole sprints starting in
        each selected month.
      </p>
    </section>
  );
}
function HourBar({
  title,
  items,
  target,
  available,
  unavailable,
  breakdown = false,
}: {
  title: string;
  items: WorkItem[];
  target: { min: number; max: number };
  available: boolean;
  unavailable: string;
  breakdown?: boolean;
}) {
  const totals = hourTotals(items);
  const status =
    totals.estimate > target.max
      ? "Above target"
      : totals.estimate < target.min
        ? "Below target"
        : "Within target";
  return (
    <article className="hour-card" aria-label={title}>
      <h3>{title}</h3>
      {available ? (
        <>
          <div className="hour-totals">
            <strong>Estimated: {totals.estimate}h</strong>
            <strong>Completed: {totals.completed}h</strong>
          </div>
          <p>
            {breakdown
              ? `Combined capacity: ${target.min}–${target.max}h`
              : `Target: ${target.min}–${target.max}h · ${status}`}
          </p>
          <div
            className="hour-bar"
            role="progressbar"
            aria-label={`${title} estimated hours`}
            aria-valuemin={0}
            aria-valuemax={Math.max(target.max, 1)}
            aria-valuenow={Math.min(totals.estimate, Math.max(target.max, 1))}
          >
            <span
              style={{
                width: `${target.max ? Math.min(100, (totals.estimate / target.max) * 100) : 0}%`,
              }}
            />
          </div>
          <div
            className="hour-bar completed"
            role="progressbar"
            aria-label={`${title} completed hours`}
            aria-valuemin={0}
            aria-valuemax={Math.max(target.max, 1)}
            aria-valuenow={Math.min(totals.completed, Math.max(target.max, 1))}
          >
            <span
              style={{
                width: `${target.max ? Math.min(100, (totals.completed / target.max) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="muted">
            {items.length} tasks · {totals.unestimated} without estimates
          </p>
        </>
      ) : (
        <p className="muted">{unavailable}</p>
      )}
    </article>
  );
}
