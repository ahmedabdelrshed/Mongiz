import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceProvider, useWorkspace } from "../../app/Workspace";
import { demoMetadata, demoRepository } from "../../shared/api/demo";
import type { Metadata, Repository, WorkItem } from "../../shared/api/types";
import { StoryPointsPage } from "./StoryPointsPage";

afterEach(() => vi.restoreAllMocks());
const pointField = "Microsoft.VSTS.Scheduling.StoryPoints";
const story = (id: number, values: Partial<WorkItem> = {}): WorkItem => ({
  id,
  rev: 1,
  title: `Story ${id}`,
  type: "User Story",
  state: "New",
  assignedTo: "other@example.com",
  project: "OMS",
  iteration: "OMS\\Sprint 12",
  ...values,
});
const initial = [
  story(1),
  story(2, { state: "Active", iteration: "OMS\\Sprint 13", assignedTo: "" }),
  story(3, { storyPoints: 0 }),
  story(4, { storyPoints: 5 }),
  story(5, { type: "Task" }),
  story(6, { project: "Platform" }),
];
function WorkProbe() {
  const w = useWorkspace();
  return (
    <output data-testid="work-points">
      {w.workItems.find((item) => item.id === 1)?.storyPoints}
    </output>
  );
}
async function setup(meta: Metadata = demoMetadata, rows = initial) {
  let items = rows.map((item) => ({ ...item }));
  const repo: Repository = {
    ...demoRepository,
    projects: async () => [
      { id: "OMS", name: "OMS" },
      { id: "Platform", name: "Platform" },
    ],
    workMetadata: vi.fn(async () => meta),
    listMine: vi.fn(async () => items),
    update: vi.fn(async (item, values) => {
      const updated = {
        ...item,
        rev: item.rev + 1,
        storyPoints: Number(Object.values(values)[0]),
      };
      items = items.map((current) =>
        current.id === item.id ? updated : current,
      );
      return updated;
    }),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <WorkspaceProvider repositoryOverride={repo}>
          <StoryPointsPage />
          <WorkProbe />
        </WorkspaceProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("option", { name: "OMS" });
  await user.selectOptions(
    screen.getByLabelText("Project for story points"),
    "OMS",
  );
  await screen.findByRole("region", { name: "Unestimated stories" });
  return { user, client, repo };
}
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  await user.click(screen.getByRole("button", { name: label }));
  await user.click(
    within(screen.getByRole("dialog", { name: `${label} options` })).getByText(
      value,
      { exact: true },
    ),
  );
  await user.keyboard("{Escape}");
}

it("loads all assignees in the selected project and excludes tasks, other projects and existing points including zero", async () => {
  const { repo } = await setup();
  expect(repo.workMetadata).toHaveBeenCalledWith([{ id: "OMS", name: "OMS" }]);
  expect(repo.listMine).toHaveBeenCalledWith("all", demoMetadata);
  expect(
    screen.getByText("Showing 2 of 2 unestimated stories"),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Story points for #1")).toBeInTheDocument();
  expect(screen.getByLabelText("Story points for #2")).toBeInTheDocument();
  for (const id of [3, 4, 5, 6])
    expect(
      screen.queryByLabelText(`Story points for #${id}`),
    ).not.toBeInTheDocument();
});

it("combines multi sprint and state filters with search and preserves typed estimates while filtering", async () => {
  const { user } = await setup();
  await user.type(screen.getByLabelText("Story points for #1"), "3");
  await choose(user, "Filter sprint", "OMS\\Sprint 13");
  expect(
    screen.queryByLabelText("Story points for #1"),
  ).not.toBeInTheDocument();
  await choose(user, "Filter story state", "New");
  expect(screen.getByText("No matching stories")).toBeInTheDocument();
  await choose(user, "Filter story state", "Active");
  expect(screen.getByLabelText("Story points for #2")).toBeInTheDocument();
  await choose(user, "Filter sprint", "OMS\\Sprint 12");
  expect(screen.getByLabelText("Story points for #1")).toHaveValue(3);
  await user.type(
    screen.getByLabelText("Search unestimated stories"),
    "Story 2",
  );
  expect(
    screen.queryByLabelText("Story points for #1"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Story points for #2")).toBeInTheDocument();
});

it("saves decimal points with the current revision, removes the row and synchronizes other views", async () => {
  const { user, client, repo } = await setup();
  client.setQueryData(["hours-work", "demo"], initial);
  client.setQueryData(["move-stories-items", "demo", "OMS"], initial);
  await user.type(screen.getByLabelText("Story points for #1"), "2.5");
  await user.click(
    screen.getByRole("button", { name: "Save story points for #1" }),
  );
  expect(repo.update).toHaveBeenCalledWith(
    expect.objectContaining({ id: 1, rev: 1 }),
    { [pointField]: 2.5 },
  );
  await waitFor(() =>
    expect(
      screen.queryByLabelText("Story points for #1"),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByText("Saved 2.5 story points for #1."),
  ).toBeInTheDocument();
  expect(screen.getByTestId("work-points")).toHaveTextContent("2.5");
  for (const key of [
    ["hours-work", "demo"],
    ["move-stories-items", "demo", "OMS"],
    ["story-points-items", "demo", "OMS"],
  ]) {
    expect(
      client.getQueryData<WorkItem[]>(key)?.find((item) => item.id === 1)
        ?.storyPoints,
    ).toBe(2.5);
  }
});

it("accepts zero and uses the selected project's Effort field", async () => {
  const effort = "Microsoft.VSTS.Scheduling.Effort";
  const { user, repo } = await setup({
    ...demoMetadata,
    projectConfigs: {
      OMS: { ...demoMetadata, storyPointField: effort },
    },
  });
  await user.type(screen.getByLabelText("Story points for #1"), "0");
  await user.click(
    screen.getByRole("button", { name: "Save story points for #1" }),
  );
  expect(repo.update).toHaveBeenCalledWith(expect.anything(), { [effort]: 0 });
  await waitFor(() =>
    expect(
      screen.queryByLabelText("Story points for #1"),
    ).not.toBeInTheDocument(),
  );
});

it("rejects empty, negative and excessive values without writing", async () => {
  const { user, repo } = await setup();
  const input = screen.getByLabelText("Story points for #1");
  for (const value of ["", "-1", "10001"]) {
    await user.clear(input);
    if (value) await user.type(input, value);
    await user.click(
      screen.getByRole("button", { name: "Save story points for #1" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/between 0 and 10,000/);
  }
  expect(repo.update).not.toHaveBeenCalled();
});

it("keeps failed edits for retry, refreshes revisions and prevents duplicate submissions", async () => {
  const { user, repo } = await setup();
  vi.mocked(repo.update).mockRejectedValueOnce(
    new Error("This item changed. Refresh before saving."),
  );
  await user.type(screen.getByLabelText("Story points for #1"), "8");
  await user.click(
    screen.getByRole("button", { name: "Save story points for #1" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This item changed",
  );
  expect(screen.getByLabelText("Story points for #1")).toHaveValue(8);
  vi.mocked(repo.listMine).mockResolvedValue(
    initial.map((item) => ({ ...item, rev: 7 })),
  );
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled(),
  );
  let finish!: (item: WorkItem) => void;
  vi.mocked(repo.update).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await user.dblClick(
    screen.getByRole("button", { name: "Save story points for #1" }),
  );
  expect(repo.update).toHaveBeenCalledTimes(2);
  expect(repo.update).toHaveBeenLastCalledWith(
    expect.objectContaining({ rev: 7 }),
    { [pointField]: 8 },
  );
  expect(screen.getByLabelText("Project for story points")).toBeDisabled();
  finish(story(1, { rev: 8, storyPoints: 8 }));
  await waitFor(() =>
    expect(
      screen.queryByLabelText("Story points for #1"),
    ).not.toBeInTheDocument(),
  );
});

it("blocks estimation when the story has unsaved My work edits", async () => {
  const { user, repo } = await setup();
  localStorage.setItem(
    "taskflow:v1:demo:work-edits",
    JSON.stringify({ 1: { rev: 1, values: { "System.Title": "Draft" } } }),
  );
  await user.type(screen.getByLabelText("Story points for #1"), "5");
  await user.click(
    screen.getByRole("button", { name: "Save story points for #1" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("unsaved My work edits");
  expect(repo.update).not.toHaveBeenCalled();
});

it("disables estimation for unsupported fields and clears filters/drafts on project change", async () => {
  const { user } = await setup({ ...demoMetadata, storyPointField: undefined });
  expect(screen.getByLabelText("Story points for #1")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Save story points for #1" }),
  ).toBeDisabled();
  await user.type(
    screen.getByLabelText("Search unestimated stories"),
    "missing",
  );
  await user.selectOptions(
    screen.getByLabelText("Project for story points"),
    "Platform",
  );
  await screen.findByLabelText("Story points for #6");
  expect(screen.getByLabelText("Search unestimated stories")).toHaveValue("");
  expect(
    screen.queryByLabelText("Story points for #1"),
  ).not.toBeInTheDocument();
});

it("shows an empty project and recovers from loading errors", async () => {
  const { user, repo } = await setup(demoMetadata, [
    story(1, { storyPoints: 3 }),
  ]);
  expect(screen.getByText("All stories have story points")).toBeInTheDocument();
  vi.mocked(repo.listMine).mockRejectedValueOnce(
    new Error("Cannot load stories"),
  );
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Cannot load stories",
  );
  await user.click(screen.getByRole("button", { name: "Retry loading" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(screen.getByText("All stories have story points")).toBeInTheDocument();
});
