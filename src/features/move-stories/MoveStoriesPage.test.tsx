import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceProvider, useWorkspace } from "../../app/Workspace";
import { demoMetadata, demoRepository } from "../../shared/api/demo";
import { MoveStoriesPage } from "./MoveStoriesPage";
import type { WorkItem } from "../../shared/api/types";

afterEach(() => vi.restoreAllMocks());
const destination = "OMS\\Sprint 13";
async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const user = userEvent.setup();
  const meta = vi.spyOn(demoRepository, "workMetadata");
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <WorkspaceProvider repositoryOverride={demoRepository}>
          <MoveStoriesPage />
          <PartialWorkProbe />
        </WorkspaceProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("option", { name: "OMS" });
  await user.selectOptions(
    screen.getByLabelText("Project to move stories"),
    "OMS",
  );
  await screen.findByRole("checkbox", { name: /Select story #2481/ });
  return { user, client, meta };
}
function PartialWorkProbe() {
  const w = useWorkspace();
  return (
    <output data-testid="partial-work">
      {w.workItems.find((i) => i.id === 2481)?.iteration}
    </output>
  );
}
async function selectStory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("checkbox", { name: /Select story #2481/ }),
  );
  await user.selectOptions(
    screen.getByLabelText("Destination iteration"),
    destination,
  );
}
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  await user.click(screen.getByRole("button", { name: label }));
  const menu = screen.getByRole("dialog", { name: `${label} options` });
  await user.click(within(menu).getByText(value, { exact: true }));
  await user.keyboard("{Escape}");
}

it("loads the chosen project independently, starts with no tasks, and requires review before writing", async () => {
  const update = vi.spyOn(demoRepository, "update");
  const { user, meta } = await setup();
  expect(meta).toHaveBeenCalledWith([{ id: "OMS", name: "OMS" }]);
  expect(
    screen.getByText("No task statuses selected: only stories will move."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review move" })).toBeDisabled();
  await selectStory(user);
  await user.click(screen.getByRole("button", { name: "Review move" }));
  expect(update).not.toHaveBeenCalled();
  expect(
    within(screen.getByRole("region", { name: "Review move" })).getByText(
      /1 stories and 0 tasks/,
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Move" }));
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
  expect(update.mock.calls[0][1]).toEqual({
    "System.IterationPath": destination,
  });
  await screen.findByRole("region", { name: "Move results" });
});

it("selects multiple task statuses, explicitly includes Closed, and can clear every selection", async () => {
  const { user } = await setup();
  await choose(user, "Task statuses to move", "Active");
  await choose(user, "Task statuses to move", "Closed");
  expect(screen.getByText("2 matching tasks")).toBeInTheDocument();
  await selectStory(user);
  await user.click(screen.getByRole("button", { name: "Review move" }));
  const review = within(screen.getByRole("region", { name: "Review move" }));
  expect(review.getByText(/#2482 Analyze requirements/)).toBeInTheDocument();
  expect(review.getByText(/#2483 Build search form/)).toBeInTheDocument();
  expect(review.queryByText(/#2484 Integrate/)).not.toBeInTheDocument();
  await choose(user, "Task statuses to move", "Clear selection");
  expect(
    screen.queryByRole("region", { name: "Review move" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText("No task statuses selected: only stories will move."),
  ).toBeInTheDocument();
  await choose(user, "Task statuses to move", "Active");
  await choose(user, "Task statuses to move", "Active");
  expect(
    screen.getByRole("button", { name: "Task statuses to move" }),
  ).toHaveTextContent("None selected");
});

it("combines filters and removes hidden stories from the selection", async () => {
  const { user } = await setup();
  await user.click(
    screen.getByRole("checkbox", { name: "Select all filtered stories" }),
  );
  await user.type(screen.getByLabelText("Search stories"), "2481");
  expect(screen.getByText("1 selected")).toBeInTheDocument();
  await choose(user, "Filter story status", "Active");
  await user.selectOptions(
    screen.getByLabelText("Source iteration"),
    "OMS\\Sprint 12",
  );
  expect(
    screen.getByRole("checkbox", { name: /Select story #2481/ }),
  ).toBeChecked();
  await user.type(screen.getByLabelText("Search stories"), "missing");
  expect(screen.getByText("0 selected")).toBeInTheDocument();
  expect(screen.getByText("No matching stories")).toBeInTheDocument();
  await user.clear(screen.getByLabelText("Search stories"));
  expect(
    screen.getByRole("checkbox", { name: /Select story #2481/ }),
  ).not.toBeChecked();
});

it("blocks moves with local edits, including edits introduced after review", async () => {
  const update = vi.spyOn(demoRepository, "update");
  const { user } = await setup();
  await selectStory(user);
  localStorage.setItem(
    "taskflow:v1:demo:work-edits",
    JSON.stringify({ 2481: { rev: 1, values: { "System.Title": "Draft" } } }),
  );
  await user.click(screen.getByRole("button", { name: "Review move" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    /Save or discard unsaved My work edits for #2481/,
  );
  expect(update).not.toHaveBeenCalled();
  localStorage.removeItem("taskflow:v1:demo:work-edits");
  await user.click(screen.getByRole("button", { name: "Review move" }));
  localStorage.setItem(
    "taskflow:v1:demo:work-edits",
    JSON.stringify({
      2481: { rev: 1, values: { "System.Title": "Later draft" } },
    }),
  );
  await user.click(screen.getByRole("button", { name: "Move" }));
  expect(update).not.toHaveBeenCalled();
});

it("updates page, hours, query caches and partial My work state", async () => {
  const { user, client } = await setup();
  const loaded = await demoRepository.listMine("all");
  client.setQueryData(["hours-work", "demo"], loaded);
  await selectStory(user);
  await user.click(screen.getByRole("button", { name: "Review move" }));
  await user.click(screen.getByRole("button", { name: "Move" }));
  await waitFor(() =>
    expect(screen.getByTestId("partial-work")).toHaveTextContent(destination),
  );
  for (const key of [
    ["hours-work", "demo"],
    ["work", "demo", "OMS"],
    ["move-stories-items", "demo", "OMS"],
  ]) {
    expect(
      client.getQueryData<WorkItem[]>(key)?.find((i) => i.id === 2481)
        ?.iteration,
    ).toBe(destination);
  }
});

it("retries only unfinished tasks with refreshed revisions", async () => {
  const original = demoRepository.update;
  let fail = true;
  const update = vi
    .spyOn(demoRepository, "update")
    .mockImplementation(async (item, fields) => {
      if (fail && item.id === 2483) throw new Error("Revision conflict");
      return original(item, fields);
    });
  const { user } = await setup();
  await choose(user, "Task statuses to move", "Active");
  await choose(user, "Task statuses to move", "New");
  await selectStory(user);
  await user.click(screen.getByRole("button", { name: "Review move" }));
  await user.click(screen.getByRole("button", { name: "Move" }));
  await screen.findByRole("button", { name: "Retry failed" });
  expect(update.mock.calls.map(([i]) => i.id)).toEqual([2481, 2483, 2484]);
  const task = (await demoRepository.listMine("all")).find(
    (i) => i.id === 2483,
  )!;
  await original(task, { "System.Title": "Updated elsewhere" });
  fail = false;
  await user.click(screen.getByRole("button", { name: "Retry failed" }));
  await screen.findByRole("heading", { name: "Review unfinished changes" });
  expect(update).toHaveBeenCalledTimes(3);
  await user.click(screen.getByRole("button", { name: "Move" }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(4));
  expect(update.mock.calls[3][0]).toMatchObject({
    id: 2483,
    rev: 2,
    title: "Updated elsewhere",
  });
  expect(
    screen.getByRole("region", { name: "Move results" }),
  ).toHaveTextContent("3 moved · 0 failed");
});

it("rechecks task statuses on retry and reconciles a write whose response was lost", async () => {
  const original = demoRepository.update;
  vi.spyOn(demoRepository, "update").mockImplementation(
    async (item, fields) => {
      if (item.id === 2483) throw new Error("Revision conflict");
      const updated = await original(item, fields);
      if (item.id === 2484) throw new Error("Response lost");
      return updated;
    },
  );
  const { user } = await setup();
  await choose(user, "Task statuses to move", "Active");
  await choose(user, "Task statuses to move", "New");
  await selectStory(user);
  await user.click(screen.getByRole("button", { name: "Review move" }));
  await user.click(screen.getByRole("button", { name: "Move" }));
  await screen.findByRole("button", { name: "Retry failed" });
  const task = (await demoRepository.listMine("all")).find(
    (i) => i.id === 2483,
  )!;
  await original(task, { "System.State": "Closed" });
  await user.click(screen.getByRole("button", { name: "Retry failed" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Retry failed" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("region", { name: "Move results" }),
  ).toHaveTextContent("2 moved · 0 failed · 1 skipped");
  expect(
    screen.queryByRole("heading", { name: "Review unfinished changes" }),
  ).not.toBeInTheDocument();
});

it("locks project and move controls while submitting", async () => {
  let finish!: (item: WorkItem) => void;
  const update = vi.spyOn(demoRepository, "update").mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { user } = await setup();
  await selectStory(user);
  await user.click(screen.getByRole("button", { name: "Review move" }));
  await user.click(screen.getByRole("button", { name: "Move" }));
  expect(screen.getByLabelText("Project to move stories")).toBeDisabled();
  expect(screen.getByLabelText("Search stories")).toBeDisabled();
  expect(screen.getByLabelText("Destination iteration")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Task statuses to move" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Move" }),
  ).toBeDisabled();
  finish({ ...update.mock.calls[0][0], rev: 2, iteration: destination });
  await waitFor(() =>
    expect(screen.getByLabelText("Project to move stories")).toBeEnabled(),
  );
  expect(update).toHaveBeenCalledOnce();
});

it("recovers iteration loading errors and resets state when switching projects", async () => {
  const tree = vi
    .spyOn(demoRepository, "projectIterations")
    .mockRejectedValueOnce(new Error("Iterations unavailable"));
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <WorkspaceProvider repositoryOverride={demoRepository}>
          <MoveStoriesPage />
        </WorkspaceProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("option", { name: "OMS" });
  await user.selectOptions(
    screen.getByLabelText("Project to move stories"),
    "OMS",
  );
  await screen.findByText("Iterations unavailable");
  await user.click(screen.getByRole("button", { name: "Retry loading" }));
  await screen.findByRole("checkbox", { name: /Select story #2481/ });
  expect(tree).toHaveBeenCalledTimes(2);
  await choose(user, "Task statuses to move", "Closed");
  await selectStory(user);
  await user.selectOptions(
    screen.getByLabelText("Project to move stories"),
    "",
  );
  await user.selectOptions(
    screen.getByLabelText("Project to move stories"),
    "OMS",
  );
  expect(screen.getByText("0 selected")).toBeInTheDocument();
  expect(screen.getByLabelText("Destination iteration")).toHaveValue("");
  expect(
    screen.getByRole("button", { name: "Task statuses to move" }),
  ).toHaveTextContent("None selected");
});
