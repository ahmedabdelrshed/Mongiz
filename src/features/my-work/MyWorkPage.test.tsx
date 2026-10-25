import { expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { WorkspaceProvider } from "../../app/Workspace";
import { demoRepository } from "../../shared/api/demo";
import { MyWorkPage } from "./MyWorkPage";
import * as excelExport from "./exportWorkItems";
import { fields } from "../../shared/api/types";
// The work fixtures belong to Sprint 12, rather than whichever sprint is current when tests run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("exports the filtered view with parent stories and unsaved values without saving", async () => {
  const download = vi.spyOn(excelExport, "exportWorkItems").mockResolvedValue();
  const update = vi.spyOn(demoRepository, "update");
  const user = userEvent.setup();
  setup();
  const estimate = await screen.findByLabelText(
    "Build search form estimate hours",
  );
  await user.clear(estimate);
  await user.type(estimate, "5");
  await user.tab();
  await user.type(screen.getByLabelText("Search work"), "Build search");
  await user.click(screen.getByRole("button", { name: "Export Excel" }));
  await waitFor(() => expect(download).toHaveBeenCalledOnce());
  const exported = download.mock.calls[0][0];
  expect(exported.stories.map((item) => item.id)).toEqual([2481]);
  expect(exported.tasks.map((item) => item.id)).toEqual([2483]);
  expect(exported.tasks[0]).toMatchObject({ estimate: 5, project: "OMS" });
  expect(exported.tasks[0].url).toBe(
    "https://dev.azure.com/demo/OMS/_workitems/edit/2483",
  );
  expect(exported.stories[0].url).toBe(
    "https://dev.azure.com/demo/OMS/_workitems/edit/2481",
  );
  expect(update).not.toHaveBeenCalled();
  await screen.findByText(/Exported 1 user stories and 1 tasks to Excel/);
  await user.clear(screen.getByLabelText("Search work"));
  await user.click(
    screen.getByRole("checkbox", { name: /Select task.*Build search form/ }),
  );
  await user.click(screen.getByRole("button", { name: "Export Excel" }));
  await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
  expect(download.mock.calls[1][0].tasks).toHaveLength(3);
  await user.type(screen.getByLabelText("Search work"), "no matching work");
  expect(screen.getByRole("button", { name: "Export Excel" })).toBeDisabled();
});

it("shows export failures and allows retrying", async () => {
  const download = vi
    .spyOn(excelExport, "exportWorkItems")
    .mockRejectedValueOnce(new Error("Download unavailable"))
    .mockResolvedValue();
  const user = userEvent.setup();
  setup();
  await screen.findByLabelText("Build search form estimate hours");
  await user.click(screen.getByRole("button", { name: "Export Excel" }));
  await screen.findByText("Excel export failed: Download unavailable");
  expect(screen.getByRole("button", { name: "Export Excel" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Export Excel" }));
  await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
  await screen.findByText(/Exported 1 user stories and 3 tasks to Excel/);
});
function setup() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <WorkspaceProvider repositoryOverride={demoRepository}>
          <MyWorkPage />
        </WorkspaceProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
async function hourTaskFixture() {
  const existing = await demoRepository.listMine();
  const titles: Record<number, string> = {
    2482: "Implement frontend requirements",
    2483: "Unit testing",
    2484: "Backend code review",
  };
  const tasks = existing.map((item) => ({
    ...item,
    title: titles[item.id] ?? item.title,
  }));
  localStorage.setItem(
    "taskflow:v1:demo:workitems",
    JSON.stringify([
      ...tasks,
      {
        ...tasks[1],
        id: 2490,
        title: "Implement backend for Sara",
        assignedTo: "sara@example.com",
        estimate: 5,
      },
    ]),
  );
  return tasks;
}

it("searches story titles and prefixed IDs with filtered children and retains task parent context", async () => {
  const user = userEvent.setup();
  setup();
  const search = await screen.findByLabelText("Search work");
  await user.type(search, "  DEVICE HISTORY  ");
  expect(screen.getByLabelText("Build search form state")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Analyze requirements state"),
  ).toBeInTheDocument();
  await chooseFilter(user, "Filter status", "Closed");
  expect(
    screen.queryByLabelText("Build search form state"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByLabelText("Analyze requirements state"),
  ).toBeInTheDocument();
  await chooseFilter(user, "Filter status", "All statuses");
  await user.clear(search);
  await user.type(search, " #2483 ");
  expect(
    screen.getByRole("heading", {
      name: "Search device history by serial number",
    }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Build search form state")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Analyze requirements state"),
  ).not.toBeInTheDocument();
  await user.clear(search);
  await user.type(search, " #2481 ");
  expect(
    screen.getByLabelText("Integrate traceability API state"),
  ).toBeInTheDocument();
  await user.clear(search);
  expect(
    screen.getByLabelText("Analyze requirements state"),
  ).toBeInTheDocument();
});

it("fills filtered sprint hours independently of hour controls and selection, with Save and Discard", async () => {
  await hourTaskFixture();
  const update = vi.spyOn(demoRepository, "update");
  const user = userEvent.setup();
  setup();
  await screen.findByLabelText(
    "Implement frontend requirements estimate hours",
  );
  await user.click(
    screen.getByRole("button", { name: "Configure sprint minimum" }),
  );
  const fill = screen.getByRole("button", { name: "Fill sprint minimum" });
  expect(screen.getByText("Sprint minimum: 30h")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Hour settings and breakdowns" }),
  );
  const target = screen.getByLabelText("Sprint target minimum");
  await user.clear(target);
  await user.type(target, "12");
  expect(screen.getByText("Sprint minimum: 12h")).toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText("Calculation user"),
    "sara@example.com",
  );
  await chooseFilter(user, "Calculation sprints", "Current sprints");
  await chooseFilter(user, "Calculation sprints", "OMS · Sprint 13");
  await user.type(screen.getByLabelText("Search work"), " #2481 ");
  await user.click(
    screen.getByRole("checkbox", { name: "Select task: Unit testing" }),
  );
  await user.click(fill);
  expect(
    screen.getByLabelText("Implement frontend requirements estimate hours"),
  ).toHaveValue(7);
  expect(
    screen.getByLabelText("Implement frontend requirements completed hours"),
  ).toHaveValue(7);
  expect(
    screen.getByLabelText("Implement frontend requirements state"),
  ).toHaveValue("Closed");
  expect(
    screen.getByLabelText("Implement frontend requirements remaining hours"),
  ).toHaveValue(0);
  expect(screen.getByLabelText("Unit testing estimate hours")).toHaveValue(3);
  expect(screen.getByLabelText("Unit testing completed hours")).toHaveValue(3);
  expect(
    screen.getByLabelText("Backend code review estimate hours"),
  ).toHaveValue(2);
  expect(
    screen.getByLabelText("Backend code review completed hours"),
  ).toHaveValue(2);
  expect(update).not.toHaveBeenCalled();
  const draft = JSON.parse(
    localStorage.getItem("taskflow:v1:demo:work-edits")!,
  );
  expect(draft).toEqual({
    "2482": { rev: 1, values: { [fields.estimate]: 7, [fields.completed]: 7 } },
    "2483": { rev: 1, values: { [fields.completed]: 3 } },
    "2484": { rev: 1, values: { [fields.completed]: 2 } },
  });
  await user.click(fill);
  expect(
    screen.getByText(/Already at or above the minimum/),
  ).toBeInTheDocument();
  expect(
    JSON.parse(localStorage.getItem("taskflow:v1:demo:work-edits")!),
  ).toEqual(draft);
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(
    screen.getByLabelText("Implement frontend requirements estimate hours"),
  ).toHaveValue(2);
  expect(
    screen.getByLabelText("Implement frontend requirements completed hours"),
  ).toHaveValue(2);
  expect(screen.getByLabelText("Unit testing completed hours")).toHaveValue(
    null,
  );
  expect(
    screen.getByLabelText("Backend code review completed hours"),
  ).toHaveValue(null);
  await user.click(fill);
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await screen.findByText("Saved changes to 3 work items.");
  expect(update).toHaveBeenCalledTimes(3);
  expect(update.mock.calls[0][1]).toEqual({
    [fields.estimate]: 7,
    [fields.completed]: 7,
  });
  expect(update.mock.calls[1][1]).toEqual({ [fields.completed]: 3 });
  expect(update.mock.calls[2][1]).toEqual({ [fields.completed]: 2 });
  expect(
    (await demoRepository.listMine()).find((item) => item.id === 2490)
      ?.estimate,
  ).toBe(5);
});

it("selects implementation and review together, toggles categories, and restores Auto", async () => {
  await hourTaskFixture();
  const update = vi.spyOn(demoRepository, "update");
  const user = userEvent.setup();
  setup();
  await user.click(
    await screen.findByRole("button", { name: "Configure sprint minimum" }),
  );
  const implementation = await screen.findByRole("button", {
    name: "Implementation",
  });
  const review = screen.getByRole("button", { name: "Code review" });
  const auto = screen.getByRole("button", { name: "Auto" });
  await user.click(implementation);
  await user.click(review);
  expect(implementation).toHaveAttribute("aria-pressed", "true");
  expect(review).toHaveAttribute("aria-pressed", "true");
  expect(auto).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: "Fill sprint minimum" }));
  for (const title of [
    "Implement frontend requirements",
    "Backend code review",
  ]) {
    expect(screen.getByLabelText(`${title} estimate hours`)).toHaveValue(13.5);
    expect(screen.getByLabelText(`${title} completed hours`)).toHaveValue(13.5);
  }
  expect(screen.getByLabelText("Unit testing estimate hours")).toHaveValue(3);
  expect(screen.getByLabelText("Unit testing completed hours")).toHaveValue(3);
  expect(update).not.toHaveBeenCalled();
  await user.click(implementation);
  expect(implementation).toHaveAttribute("aria-pressed", "false");
  expect(review).toHaveAttribute("aria-pressed", "true");
  await user.click(review);
  expect(auto).toHaveAttribute("aria-pressed", "true");
  await user.click(implementation);
  await user.click(review);
  await user.click(auto);
  expect(auto).toHaveAttribute("aria-pressed", "true");
  expect(implementation).toHaveAttribute("aria-pressed", "false");
  expect(review).toHaveAttribute("aria-pressed", "false");
});

it("fills a searched testing task alone and rejects cleared hour drafts before staging more changes", async () => {
  await hourTaskFixture();
  const update = vi.spyOn(demoRepository, "update");
  const user = userEvent.setup();
  setup();
  const search = await screen.findByLabelText("Search work");
  await user.type(search, "unit testing");
  await user.click(
    screen.getByRole("button", { name: "Configure sprint minimum" }),
  );
  const fill = screen.getByRole("button", { name: "Fill sprint minimum" });
  await user.click(screen.getByRole("button", { name: "Testing" }));
  expect(screen.getByRole("button", { name: "Testing" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.clear(screen.getByLabelText("Unit testing estimate hours"));
  await user.click(fill);
  expect(
    screen.getByText(/Hours \/ story points must be a number/),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Unit testing completed hours")).toHaveValue(
    null,
  );
  await user.type(screen.getByLabelText("Unit testing estimate hours"), "6");
  await user.click(fill);
  expect(screen.getByLabelText("Unit testing estimate hours")).toHaveValue(30);
  expect(screen.getByLabelText("Unit testing completed hours")).toHaveValue(30);
  expect(screen.getByLabelText("Unit testing remaining hours")).toHaveValue(2);
  expect(screen.getByLabelText("Unit testing state")).toHaveValue("Active");
  await user.clear(search);
  expect(
    screen.getByLabelText("Implement frontend requirements estimate hours"),
  ).toHaveValue(2);
  expect(
    screen.getByLabelText("Backend code review estimate hours"),
  ).toHaveValue(2);
  expect(update).not.toHaveBeenCalled();
});
async function chooseFilter(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  if (label.startsWith("Calculation")) {
    const details = screen.queryByRole("button", {
      name: "Hour settings and breakdowns",
    });
    if (details) await user.click(details);
  }
  await user.click(screen.getByRole("button", { name: label }));
  const menu = await screen.findByRole("dialog", {
    name: `${label} options`,
  });
  await user.click(within(menu).getByText(option, { exact: true }));
  await user.keyboard("{Escape}");
}
it("edits remain local until Save; closing a task preserves siblings of every assignee", async () => {
  const existing = await demoRepository.listMine();
  const otherOwner = {
    ...existing[2],
    id: 2490,
    title: "Backend by Sara",
    assignedTo: "sara@example.com",
  };
  localStorage.setItem(
    "taskflow:v1:demo:workitems",
    JSON.stringify([...existing, otherOwner]),
  );
  const update = vi.spyOn(demoRepository, "update");
  const user = userEvent.setup();
  setup();
  await screen.findByRole("heading", {
    name: "Search device history by serial number",
  });
  await chooseFilter(user, "Filter user", "All users");
  const estimate = screen.getByLabelText("Build search form estimate hours");
  await user.clear(estimate);
  await user.type(estimate, "5");
  await user.tab();
  expect(update).not.toHaveBeenCalled();
  expect(
    screen.getByLabelText("Build search form completed hours"),
  ).toHaveValue(null);
  await user.selectOptions(
    screen.getByLabelText("Build search form state"),
    "Closed",
  );
  expect(screen.getByLabelText("Backend by Sara state")).toHaveValue("Active");
  expect(screen.getByLabelText("Integrate traceability API state")).toHaveValue(
    "New",
  );
  expect(screen.getByLabelText("Backend by Sara completed hours")).toHaveValue(
    null,
  );
  expect(
    screen.getByLabelText("Integrate traceability API completed hours"),
  ).toHaveValue(null);
  expect(update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await screen.findByText("Saved changes to 1 work items.");
  const saved = await demoRepository.listMine();
  expect(update).toHaveBeenCalledOnce();
  expect(update.mock.calls[0][0].id).toBe(2483);
  expect(saved.find((i) => i.id === 2483)).toMatchObject({
    state: "Closed",
    estimate: 5,
    completed: 5,
  });
  expect(saved.find((i) => i.id === 2484)).toEqual(
    existing.find((i) => i.id === 2484),
  );
  expect(saved.find((i) => i.id === 2490)).toEqual(otherOwner);
  expect(saved.find((i) => i.id === 2481)).toEqual(existing[0]);
  expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
});
it.each(["New", "Active"])(
  "bulk changes to %s preserve completed hours when estimates also change",
  async (state) => {
    const existing = await demoRepository.listMine();
    localStorage.setItem(
      "taskflow:v1:demo:workitems",
      JSON.stringify(
        existing.map((item) =>
          item.id === 2483 ? { ...item, completed: 1 } : item,
        ),
      ),
    );
    const update = vi.spyOn(demoRepository, "update");
    const user = userEvent.setup();
    setup();
    await screen.findByLabelText("Build search form state");
    for (const title of ["Build search form", "Integrate traceability API"])
      await user.click(
        screen.getByRole("checkbox", { name: `Select task: ${title}` }),
      );
    await user.selectOptions(screen.getByLabelText("Bulk task state"), state);
    await user.type(screen.getByLabelText("Bulk task estimate"), "6");
    await user.click(
      screen.getByRole("button", { name: "Apply to selected tasks" }),
    );
    for (const title of ["Build search form", "Integrate traceability API"]) {
      expect(screen.getByLabelText(`${title} state`)).toHaveValue(state);
      expect(screen.getByLabelText(`${title} estimate hours`)).toHaveValue(6);
    }
    expect(
      screen.getByLabelText("Build search form completed hours"),
    ).toHaveValue(1);
    expect(
      screen.getByLabelText("Integrate traceability API completed hours"),
    ).toHaveValue(null);
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Save changes/ }));
    await screen.findByText("Saved changes to 2 work items.");
    expect(update.mock.calls.map(([item]) => item.id)).toEqual([2483, 2484]);
    for (const [, values] of update.mock.calls)
      expect(values).not.toHaveProperty(fields.completed);
    const saved = await demoRepository.listMine();
    expect(saved.find((item) => item.id === 2483)).toMatchObject({
      state,
      estimate: 6,
      completed: 1,
    });
    expect(saved.find((item) => item.id === 2484)?.completed).toBeUndefined();
  },
);
it("bulk closure saves only selected My tasks and leaves unselected and hidden siblings unchanged", async () => {
  const existing = await demoRepository.listMine();
  const task = existing.find((item) => item.id === 2483)!;
  const unselected = { ...task, id: 2491, title: "Unselected task" };
  const otherOwner = {
    ...task,
    id: 2490,
    title: "Sara hidden task",
    assignedTo: "sara@example.com",
  };
  localStorage.setItem(
    "taskflow:v1:demo:workitems",
    JSON.stringify([...existing, unselected, otherOwner]),
  );
  const update = vi.spyOn(demoRepository, "update");
  const user = userEvent.setup();
  setup();
  await screen.findByLabelText("Build search form state");
  expect(screen.getByLabelText("Filter user")).toHaveTextContent("My tasks");
  expect(
    screen.queryByLabelText("Sara hidden task state"),
  ).not.toBeInTheDocument();
  await user.click(screen.getByLabelText("Select all tasks"));
  await user.click(
    screen.getByRole("checkbox", { name: "Select task: Analyze requirements" }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Select task: Unselected task" }),
  );
  await user.selectOptions(screen.getByLabelText("Bulk task state"), "Closed");
  await user.type(screen.getByLabelText("Bulk task estimate"), "6");
  await user.click(
    screen.getByRole("button", { name: "Apply to selected tasks" }),
  );
  for (const title of ["Build search form", "Integrate traceability API"]) {
    expect(screen.getByLabelText(`${title} state`)).toHaveValue("Closed");
    expect(screen.getByLabelText(`${title} completed hours`)).toHaveValue(6);
  }
  expect(screen.getByLabelText("Unselected task state")).toHaveValue("Active");
  expect(screen.getByLabelText("Unselected task completed hours")).toHaveValue(
    null,
  );
  expect(
    Object.keys(
      JSON.parse(localStorage.getItem("taskflow:v1:demo:work-edits")!),
    ),
  ).toEqual(["2483", "2484"]);
  expect(update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await screen.findByText("Saved changes to 2 work items.");
  expect(update.mock.calls.map(([item]) => item.id)).toEqual([2483, 2484]);
  const saved = await demoRepository.listMine("all");
  expect(saved.find((item) => item.id === unselected.id)).toEqual(unselected);
  expect(saved.find((item) => item.id === otherOwner.id)).toEqual(otherOwner);
  expect(saved.find((item) => item.id === 2481)).toEqual(existing[0]);
});
it("keeps failed edits and clears successful edits after a partial save", async () => {
  const original = demoRepository.update;
  vi.spyOn(demoRepository, "update").mockImplementation((item, values) =>
    item.id === 2484
      ? Promise.reject(new Error("Conflict"))
      : original(item, values),
  );
  const user = userEvent.setup();
  setup();
  await screen.findByRole("heading", {
    name: "Search device history by serial number",
  });
  expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
  await user.clear(screen.getByLabelText("Build search form estimate hours"));
  await user.type(
    screen.getByLabelText("Build search form estimate hours"),
    "5",
  );
  await user.clear(
    screen.getByLabelText("Integrate traceability API estimate hours"),
  );
  await user.type(
    screen.getByLabelText("Integrate traceability API estimate hours"),
    "4",
  );
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await screen.findByText(/Failed changes remain unsaved/);
  expect(
    screen.getByRole("button", { name: /Save changes \(1\)/ }),
  ).toBeEnabled();
  const staged = JSON.parse(
    localStorage.getItem("taskflow:v1:demo:work-edits")!,
  );
  expect(Object.keys(staged)).toEqual(["2484"]);
});
it("bulk selection supports exclusions, story points and shared estimates without auto-saving", async () => {
  const existing = await demoRepository.listMine();
  const low = {
    ...existing.find((i) => i.type === "Task")!,
    id: 2499,
    title: "Small review",
    state: "Closed",
    estimate: 0.1,
  };
  localStorage.setItem(
    "taskflow:v1:demo:workitems",
    JSON.stringify([...existing, low]),
  );
  const update = vi.spyOn(demoRepository, "update");
  const user = userEvent.setup();
  setup();
  await screen.findByRole("heading", {
    name: "Search device history by serial number",
  });
  await user.click(screen.getByLabelText("Select all tasks"));
  await user.click(
    screen.getByRole("checkbox", { name: /Analyze requirements/ }),
  );
  expect(screen.getByLabelText("Select all tasks")).toHaveProperty(
    "indeterminate",
    true,
  );
  await user.type(screen.getByLabelText("Bulk task estimate"), "6");
  await user.click(
    screen.getByRole("button", { name: "Apply to selected tasks" }),
  );
  expect(screen.getByLabelText("Build search form estimate hours")).toHaveValue(
    6,
  );
  expect(screen.getByLabelText("Small review estimate hours")).toHaveValue(0.1);
  expect(
    screen.getByLabelText("Analyze requirements estimate hours"),
  ).toHaveValue(2);
  await user.click(screen.getByLabelText("Select all user stories"));
  await user.type(screen.getByLabelText("Bulk story points"), "8");
  await user.selectOptions(
    screen.getByLabelText("Bulk story state"),
    "Resolved",
  );
  await user.click(
    screen.getByRole("button", { name: "Apply to selected stories" }),
  );
  expect(
    screen.getByLabelText(
      "Search device history by serial number story points",
    ),
  ).toHaveValue(8);
  expect(
    screen.getByLabelText("Search device history by serial number story state"),
  ).toHaveValue("Resolved");
  expect(screen.getByLabelText("Build search form state")).toHaveValue(
    "Active",
  );
  expect(update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await screen.findByText(/Saved changes to/);
  expect(
    (await demoRepository.listMine()).find((i) => i.type === "User Story")
      ?.storyPoints,
  ).toBe(8);
});
it("defaults to token owner/current sprint and changes user/sprint filters with separate month totals", async () => {
  const existing = await demoRepository.listMine();
  const base = existing.find((i) => i.type === "Task")!;
  const sara = {
    ...base,
    id: 2490,
    title: "Sara current task",
    assignedTo: "sara@example.com",
    estimate: 7,
    completed: 5,
  };
  const future = {
    ...base,
    id: 2491,
    title: "Next sprint task",
    iteration: "OMS\\Sprint 13",
    estimate: 10,
    completed: 3,
  };
  localStorage.setItem(
    "taskflow:v1:demo:workitems",
    JSON.stringify([...existing, sara, future]),
  );
  const user = userEvent.setup();
  setup();
  await screen.findByLabelText("Filter user");
  expect(screen.getByLabelText("Filter user")).toHaveTextContent("My tasks");
  expect(screen.getByLabelText("Filter destination")).toHaveTextContent(
    "Current sprint",
  );
  expect(
    screen.queryByLabelText("Sara current task state"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Next sprint task state"),
  ).not.toBeInTheDocument();
  const hourTotal = within(
    screen.getByRole("article", { name: "Current sprint" }),
  );
  expect(hourTotal.getByText("Estimated: 7h")).toBeInTheDocument();
  expect(screen.getByText("Estimated: 17h")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Filter user" }));
  const userMenu = screen.getByRole("dialog", {
    name: "Filter user options",
  });
  await user.type(
    within(userMenu).getByLabelText("Search Filter user"),
    "Sara",
  );
  await user.click(within(userMenu).getByText("Sara", { exact: true }));
  expect(screen.getByLabelText("Sara current task state")).toBeInTheDocument();
  expect(screen.getByLabelText("Build search form state")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await chooseFilter(user, "Filter user", "All users");
  await chooseFilter(user, "Filter user", "My tasks (ahmed@example.com)");
  await chooseFilter(user, "Filter destination", "All iterations");
  await chooseFilter(user, "Filter destination", "OMS\\Sprint 13");
  expect(screen.getByLabelText("Next sprint task state")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Build search form state"),
  ).not.toBeInTheDocument();
  expect(hourTotal.getByText("Estimated: 7h")).toBeInTheDocument();
  await chooseFilter(user, "Calculation sprints", "Current sprints");
  await chooseFilter(user, "Calculation sprints", "OMS · Sprint 13");
  expect(hourTotal.getByText("Estimated: 10h")).toBeInTheDocument();
  expect(screen.getByLabelText("Filter destination")).toHaveTextContent(
    "OMS\\Sprint 13",
  );
  await chooseFilter(user, "Filter destination", "All iterations");
  await chooseFilter(user, "Filter user", "All users");
  expect(screen.getByLabelText("Sara current task state")).toBeInTheDocument();
  expect(screen.getByLabelText("Next sprint task state")).toBeInTheDocument();
});

it("shows incremental progress and keeps loaded work editable", async () => {
  const all = await demoRepository.listMine("all");
  const story = all.find((item) => item.type === "User Story")!;
  const task = all.find((item) => item.type === "Task")!;
  let resolve!: (items: typeof all) => void;
  let emit!: (
    progress: import("../../shared/api/types").WorkLoadProgress,
  ) => void;
  const fetch = vi.spyOn(demoRepository, "listMine").mockImplementation(
    (_assignee, _metadata, onProgress) =>
      new Promise((r) => {
        resolve = r;
        emit = onProgress!;
      }),
  );
  const user = userEvent.setup();
  setup();
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await screen.findByRole("progressbar", {
    name: "Selected projects progress",
  });
  expect(screen.getByLabelText("Filter status")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refreshing…" })).toBeEnabled();
  emit({
    project: { id: "oms", name: "OMS" },
    projectIndex: 0,
    totalProjects: 1,
    completedProjects: 0,
    phase: "loading",
    totalItems: all.length,
    loadedItems: 2,
    items: [story, task],
  });
  const estimate = await screen.findByLabelText(`${task.title} estimate hours`);
  expect(screen.getByRole("button", { name: "Export Excel" })).toBeDisabled();
  expect(screen.getByLabelText("Current project items progress")).toHaveValue(
    2,
  );
  await user.click(
    screen.getByRole("button", { name: "Configure sprint minimum" }),
  );
  expect(
    screen.getByRole("button", { name: "Fill sprint minimum" }),
  ).toBeDisabled();
  await user.clear(estimate);
  await user.type(estimate, "4");
  expect(estimate).toHaveValue(4);
  emit({
    project: { id: "oms", name: "OMS" },
    projectIndex: 0,
    totalProjects: 1,
    completedProjects: 0,
    phase: "loading",
    totalItems: all.length,
    loadedItems: all.length,
    items: all.filter((item) => item.id !== story.id && item.id !== task.id),
  });
  resolve(all);
  await waitFor(() =>
    expect(
      screen.queryByLabelText("Selected projects progress"),
    ).not.toBeInTheDocument(),
  );
  await chooseFilter(user, "Filter status", "Closed");
  expect(screen.getByLabelText("Filter status")).toHaveTextContent("Closed");
  await user.click(
    screen.getByRole("button", { name: "Show all loaded items" }),
  );
  expect(screen.getByLabelText("Build search form state")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Calculation user")).toHaveValue("mine");
  expect(screen.getByLabelText("Calculation sprints")).toHaveTextContent(
    "Current sprints",
  );
});

it("keeps partial rows visible when a work load fails", async () => {
  const all = await demoRepository.listMine("all");
  const story = all.find((item) => item.type === "User Story")!;
  const task = all.find((item) => item.type === "Task")!;
  let reject!: (error: Error) => void;
  const load = vi.spyOn(demoRepository, "listMine").mockImplementation(
    (_assignee, _metadata, onProgress) =>
      new Promise((_, fail) => {
        reject = fail;
        onProgress?.({
          project: { id: "platform", name: "Platform" },
          projectIndex: 1,
          totalProjects: 2,
          completedProjects: 1,
          phase: "loading",
          totalItems: 5,
          loadedItems: 2,
          items: [story, task],
        });
      }),
  );
  const user = userEvent.setup();
  setup();
  await screen.findByLabelText(`${task.title} state`);
  reject(new Error("Platform: work-item loading failed."));
  await screen.findByText("Platform: work-item loading failed.");
  expect(screen.getByRole("button", { name: "Export Excel" })).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Configure sprint minimum" }),
  );
  expect(
    screen.getByRole("button", { name: "Fill sprint minimum" }),
  ).toBeDisabled();
  expect(screen.getByLabelText(`${task.title} state`)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
});

it("refresh stays available with manual edits and preserves the draft", async () => {
  const load = vi.spyOn(demoRepository, "listMine");
  const update = vi.spyOn(demoRepository, "update");
  const user = userEvent.setup();
  setup();
  const estimate = await screen.findByLabelText(
    "Build search form estimate hours",
  );
  await user.clear(estimate);
  await user.type(estimate, "5");
  await user.click(screen.getByRole("button", { name: /^Refresh$/ }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Build search form estimate hours")).toHaveValue(
    5,
  );
  expect(update).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /Save changes/ })).toBeEnabled();
});

it("loading and estimate edits keep completed hours unchanged; closing one task updates only its live hours and discard restores saved hours", async () => {
  const update = vi.spyOn(demoRepository, "update");
  const user = userEvent.setup();
  setup();
  await screen.findByLabelText("Build search form state");
  expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
  expect(
    screen.getByLabelText("Build search form completed hours"),
  ).toHaveValue(null);
  expect(screen.getAllByText("Completed: 2h")[0]).toBeInTheDocument();
  await user.clear(screen.getByLabelText("Build search form estimate hours"));
  await user.type(
    screen.getByLabelText("Build search form estimate hours"),
    "5",
  );
  expect(
    screen.getByLabelText("Build search form completed hours"),
  ).toHaveValue(null);
  for (const state of ["New", "Active"]) {
    await user.selectOptions(
      screen.getByLabelText("Build search form state"),
      state,
    );
    expect(
      screen.getByLabelText("Build search form completed hours"),
    ).toHaveValue(null);
    expect(screen.getAllByText("Completed: 2h")[0]).toBeInTheDocument();
  }
  await user.selectOptions(
    screen.getByLabelText("Build search form state"),
    "Closed",
  );
  expect(
    screen.getByLabelText("Build search form completed hours"),
  ).toHaveValue(5);
  expect(
    screen.getByLabelText("Integrate traceability API completed hours"),
  ).toHaveValue(null);
  expect(screen.getByLabelText("Integrate traceability API state")).toHaveValue(
    "New",
  );
  expect(screen.getAllByText("Completed: 7h")[0]).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.getAllByText("Completed: 2h")[0]).toBeInTheDocument();
  expect(screen.getByLabelText("Build search form estimate hours")).toHaveValue(
    3,
  );
  expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
});
