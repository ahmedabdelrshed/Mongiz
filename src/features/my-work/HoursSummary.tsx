import { useState } from "react";
import type { Iteration, WorkItem } from "../../shared/api/types";
import {
  DEFAULT_SPRINT_TARGET,
  hourTotals,
  monthSprints,
  uniqueSprints,
  owns,
} from "./filters";
import { storageKey, useStored } from "../../shared/storage/storage";
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
  const [sprint, setSprint] = useState("current");
  const [user, setUser] = useState("mine");
  const availableIterations = iterations;
  const calculationItems = items.filter((i) => owns(i, user, owner));
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
  const selected = uniqueSprints(availableIterations).filter((i) =>
    sprint === "current" ? i.current : i.path === sprint,
  );
  const month = monthSprints(selected, availableIterations);
  const sprintTasks = calculationItems.filter((t) =>
    selected.some((i) => i.path === t.iteration),
  );
  const monthTasks = month
    ? calculationItems.filter((t) =>
        month.sprints.some((i) => i.path === t.iteration),
      )
    : [];
  const title =
    sprint === "current" ? "Current sprint" : (selected[0]?.name ?? "Sprint");
  const bounds = (factor: number) => ({
    min: target.min * factor,
    max: target.max * factor,
  });
  return (
    <section className="hours-summary" aria-label="Sprint and month hours">
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
        <strong>All accessible projects</strong>
        <select
          aria-label="Calculation sprint"
          value={sprint}
          onChange={(e) => setSprint(e.target.value)}
        >
          <option value="current">Current sprint</option>
          {uniqueSprints(availableIterations).map((i) => (
            <option key={i.path} value={i.path}>
              {i.path}
            </option>
          ))}
        </select>
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
        <HourBar
          title={title}
          items={sprintTasks}
          target={bounds(selected.length || 1)}
          available={!!selected.length}
          unavailable="Choose a sprint with metadata to calculate hours."
        />
        <HourBar
          title={
            month
              ? `Month · ${new Date(month.month + "-01T00:00:00Z").toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" })}`
              : "Month"
          }
          items={monthTasks}
          target={bounds(month?.sprints.length ?? 1)}
          available={!!month}
          unavailable="Month totals need a single month and configured sprint start dates."
        />
      </div>
      <p className="muted">
        Totals include pending local task edits across all accessible projects.
        Local closures update completed hours immediately. User and sprint
        controls are independent of the list filters. Save writes changes to
        Azure; Discard restores saved values. Month totals include whole sprints
        starting in the selected sprint's month.
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
