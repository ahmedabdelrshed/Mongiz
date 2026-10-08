import { useState } from "react";
import type { Iteration, WorkItem } from "../../shared/api/types";
import {
  DEFAULT_SPRINT_TARGET,
  hourTotals,
  uniqueSprints,
  owns,
} from "./filters";
import { storageKey, useStored } from "../../shared/storage/storage";
import { SearchableMultiSelect } from "../../shared/ui/SearchableMultiSelect";
function validTarget(value: unknown): value is { min: number; max: number } {
  const v = value as { min: number; max: number };
  return (
    !!v &&
    Number.isFinite(v.min) &&
    Number.isFinite(v.max) &&
    v.min >= 0 &&
    v.max >= v.min &&
    v.max <= 10000
  );
}
export function HoursSummary({
  items,
  iterations,
  scope,
  owner,
  people,
}: {
  items: WorkItem[];
  iterations: Iteration[];
  owner: string;
  people: import("../../shared/api/types").Person[];
  scope: string;
}) {
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
  const [target, setTarget] = useStored(
    storageKey(scope, "sprint-target"),
    DEFAULT_SPRINT_TARGET,
    validTarget,
  );
  const [minimum, setMinimum] = useState(String(target.min));
  const [maximum, setMaximum] = useState(String(target.max));
  const updateTarget = (side: "min" | "max", value: string) => {
    if (side === "min") setMinimum(value);
    else setMaximum(value);
    const min = side === "min" ? value : minimum;
    const max = side === "max" ? value : maximum;
    const next = { min: Number(min), max: Number(max) };
    if (min !== "" && max !== "" && validTarget(next)) setTarget(next);
  };
  const invalid =
    minimum === "" ||
    maximum === "" ||
    !validTarget({ min: Number(minimum), max: Number(maximum) });
  const availableSprints = uniqueSprints(availableIterations);
  const selected = availableSprints.filter(
    (iteration) =>
      selectedSprints.includes("all") ||
      (selectedSprints.includes("current") && iteration.current) ||
      selectedSprints.includes(iteration.path),
  );
  const currentMonth = new Date().toISOString().slice(0, 7);
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
    <section className="hours-summary hours-summary-compact" aria-label="Sprint and month hours">
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
          onChange={setSelectedMonths}
        />
      </div>
      <div className="hours-settings">
        <strong>Capacity target per sprint</strong>
        <label>
          Minimum hours
          <input
            aria-label="Sprint target minimum"
            type="number"
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
      <div className="hours-cards">
        {selected.length ? (
          selected.map((iteration) => (
            <HourBar
              key={iteration.path}
              title={titleFor(iteration)}
              items={calculationItems.filter(
                (item) => item.iteration === iteration.path,
              )}
              // Capacity is configured per person and sprint, not per project.
              target={bounds(1)}
              available
              unavailable=""
            />
          ))
        ) : (
          <HourBar
            title="Sprints"
            items={[]}
            target={bounds(1)}
            available={false}
            unavailable="Choose a sprint with metadata to calculate hours."
          />
        )}
        {selectedMonthValues.length ? (
          selectedMonthValues.map((month) => {
            const monthIterations = iterationsForMonth(month);
            return (
              <HourBar
                key={month}
                title={`Month · ${monthTitle(month)}`}
                items={calculationItems.filter((item) =>
                  monthIterations.some(
                    (iteration) => iteration.path === item.iteration,
                  ),
                )}
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
      <p className="muted">
        Totals include pending local task edits across all accessible projects.
        Local closures update completed hours immediately. User and sprint
        controls are independent of the list filters. Save writes changes to
        Azure; Discard restores saved values. Month totals include whole sprints
        starting in each selected month.
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
}: {
  title: string;
  items: WorkItem[];
  target: { min: number; max: number };
  available: boolean;
  unavailable: string;
}) {
  const totals = hourTotals(items);
  const status =
    totals.estimate > target.max
      ? "Above target"
      : totals.estimate < target.min
        ? "Below target"
        : "Within target";
  return (
    <article className="hour-card">
      <h3>{title}</h3>
      {available ? (
        <>
          <div className="hour-totals">
            <strong>Estimated: {totals.estimate}h</strong>
            <strong>Completed: {totals.completed}h</strong>
          </div>
          <p>
            Target: {target.min}–{target.max}h · {status}
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
