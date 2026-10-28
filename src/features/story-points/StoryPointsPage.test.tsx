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

it("filters stories and bugs and includes estimated items on request", async () => {
  const rows = [
    ...initial,
    story(7, { type: "Bug" }),
    story(8, { type: "Bug", storyPoints: 0 }),
  ];
  const { user, repo } = await setup(demoMetadata, rows);
  expect(repo.listMine).toHaveBeenCalledWith("all", demoMetadata);
  expect(screen.getByLabelText("Story points for #7")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Story points for #8"),
  ).not.toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText("Filter work item type"),
    "bugs",
  );
  expect(
    screen.queryByLabelText("Story points for #1"),
  ).not.toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText("Filter estimate status"),
    "all",
  );
  expect(screen.getByLabelText("Story points for #8")).toHaveValue(0);
});

it("applies a shared value to shown items and saves all drafts, including hidden items", async () => {
  const rows = [...initial, story(7, { type: "Bug" })];
  const { user, repo } = await setup(demoMetadata, rows);
  await user.selectOptions(
    screen.getByLabelText("Filter work item type"),
    "bugs",
  );
  await user.type(screen.getByLabelText("Shared story points"), "2.5");
  await user.click(
    screen.getByRole("button", { name: "Apply to shown items" }),
  );
  await user.selectOptions(
    screen.getByLabelText("Filter work item type"),
    "stories",
  );
  await user.type(screen.getByLabelText("Story points for #1"), "3");
  await user.click(screen.getByRole("button", { name: "Save story points" }));
  await screen.findByText("Saved story points for 2 work items.");
  expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), {
    [pointField]: 2.5,
  });
  expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), {
    [pointField]: 3,
  });
  expect(screen.getByTestId("work-points")).toHaveTextContent("3");
});

it("keeps failures for retry while saving successful items", async () => {
  const { user, repo } = await setup();
  vi.mocked(repo.update).mockRejectedValueOnce(
    new Error("Conflict; refresh before saving"),
  );
  await user.type(screen.getByLabelText("Shared story points"), "8");
  await user.click(
    screen.getByRole("button", { name: "Apply to shown items" }),
  );
  await user.click(screen.getByRole("button", { name: "Save story points" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Conflict");
  expect(screen.getByLabelText("Story points for #1")).toHaveValue(8);
  expect(
    screen.queryByLabelText("Story points for #2"),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save story points" }));
  await screen.findByText("Saved story points for 1 work item.");
  expect(repo.update).toHaveBeenCalledTimes(3);
});

it("uses the bug field and disables unsupported bug types", async () => {
  const effort = "Microsoft.VSTS.Scheduling.Effort";
  const meta = {
    ...demoMetadata,
    projectConfigs: {
      OMS: {
        ...demoMetadata,
        bugTypes: ["Bug", "Defect"],
        typeStoryPointFields: { Bug: effort, Defect: undefined },
      },
    },
  };
  const { user, repo } = await setup(meta, [
    story(7, { type: "Bug" }),
    story(8, { type: "Defect" }),
  ]);
  expect(screen.getByLabelText("Story points for #8")).toBeDisabled();
  await user.type(screen.getByLabelText("Shared story points"), "0");
  await user.click(
    screen.getByRole("button", { name: "Apply to shown items" }),
  );
  await user.click(screen.getByRole("button", { name: "Save story points" }));
  await screen.findByText("Saved story points for 1 work item.");
  expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), {
    [effort]: 0,
  });
});

it("blocks invalid values and unsaved My work edits", async () => {
  const { user, repo } = await setup();
  localStorage.setItem(
    "taskflow:v1:demo:work-edits",
    JSON.stringify({ 1: { rev: 1, values: { "System.Title": "Draft" } } }),
  );
  await user.type(screen.getByLabelText("Story points for #1"), "5");
  await user.type(screen.getByLabelText("Story points for #2"), "10001");
  await user.click(screen.getByRole("button", { name: "Save story points" }));
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  expect(repo.update).not.toHaveBeenCalled();
});
