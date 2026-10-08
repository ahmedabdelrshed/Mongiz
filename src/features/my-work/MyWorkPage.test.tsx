import { expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { WorkspaceProvider } from "../../app/Workspace";
import { demoRepository } from "../../shared/api/demo";
import { MyWorkPage } from "./MyWorkPage";
afterEach(() => vi.restoreAllMocks());
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
it("edits remain local until Save; closure includes another user's sibling task", async () => {
  const existing = await demoRepository.listMine();
  localStorage.setItem(
    "taskflow:v1:demo:workitems",
    JSON.stringify([
      ...existing,
      {
        ...existing[2],
        id: 2490,
        title: "Backend by Sara",
        assignedTo: "sara@example.com",
      },
    ]),
  );
  const update = vi.spyOn(demoRepository, "update");
  const user = userEvent.setup();
  setup();
  await screen.findByRole("heading", {
    name: "Search device history by serial number",
  });
  await user.selectOptions(screen.getByLabelText("Filter user"), "all");
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
  expect(screen.getByLabelText("Backend by Sara state")).toHaveValue("Closed");
  expect(screen.getByLabelText("Integrate traceability API state")).toHaveValue(
    "Closed",
  );
  expect(update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Save changes/ }));
  await screen.findByText(/Saved changes to/);
  const saved = await demoRepository.listMine();
  expect(
    saved.filter((i) => i.parentId === 2481).every((i) => i.state === "Closed"),
  ).toBe(true);
  expect(saved.find((i) => i.id === 2483)?.estimate).toBe(5);
  expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
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
  expect(screen.getByLabelText("Filter user")).toHaveValue("mine");
  expect(screen.getByLabelText("Filter destination")).toHaveValue("current");
  expect(
    screen.queryByLabelText("Sara current task state"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Next sprint task state"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Estimated: 7h")).toBeInTheDocument();
  expect(screen.getByText("Estimated: 17h")).toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText("Filter user"),
    "sara@example.com",
  );
  expect(screen.getByLabelText("Sara current task state")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Build search form state"),
  ).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Filter user"), "mine");
  await user.selectOptions(
    screen.getByLabelText("Filter destination"),
    "OMS\\Sprint 13",
  );
  expect(screen.getByLabelText("Next sprint task state")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Build search form state"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Estimated: 7h")).toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText("Calculation sprint"),
    "OMS\\Sprint 13",
  );
  expect(screen.getByText("Estimated: 10h")).toBeInTheDocument();
  expect(screen.getByLabelText("Filter destination")).toHaveValue(
    "OMS\\Sprint 13",
  );
  await user.selectOptions(screen.getByLabelText("Filter destination"), "all");
  await user.selectOptions(screen.getByLabelText("Filter user"), "all");
  expect(screen.getByLabelText("Sara current task state")).toBeInTheDocument();
  expect(screen.getByLabelText("Next sprint task state")).toBeInTheDocument();
});

it("waits for all work before showing filters, then filters the global snapshot locally", async () => {
  const all = await demoRepository.listMine("all");
  let resolve!: (items: typeof all) => void;
  const fetch = vi.spyOn(demoRepository, "listMine").mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const user = userEvent.setup();
  setup();
  await screen.findByRole("status");
  expect(screen.queryByLabelText("Filter status")).not.toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  resolve(all);
  await screen.findByLabelText("Filter user");
  await user.selectOptions(screen.getByLabelText("Filter status"), "Closed");
  expect(
    within(screen.getByLabelText("Filter status")).getByRole("option", {
      name: "Active",
      selected: false,
    }),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Show all loaded items" }),
  );
  expect(screen.getByLabelText("Build search form state")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Calculation user")).toHaveValue("mine");
  expect(screen.getByLabelText("Calculation sprint")).toHaveValue("current");
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

it("loading and estimate edits keep completed hours unchanged; closing siblings updates live bars and discard restores saved hours", async () => {
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
  await user.selectOptions(
    screen.getByLabelText("Build search form state"),
    "Closed",
  );
  expect(
    screen.getByLabelText("Build search form completed hours"),
  ).toHaveValue(5);
  expect(
    screen.getByLabelText("Integrate traceability API completed hours"),
  ).toHaveValue(2);
  expect(screen.getAllByText("Completed: 9h")[0]).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.getAllByText("Completed: 2h")[0]).toBeInTheDocument();
  expect(screen.getByLabelText("Build search form estimate hours")).toHaveValue(
    3,
  );
  expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
});
