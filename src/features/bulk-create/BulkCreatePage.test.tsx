import { demoRepository } from "../../shared/api/demo";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceProvider } from "../../app/Workspace";
import { BulkCreatePage } from "./BulkCreatePage";
afterEach(() => vi.restoreAllMocks());
function setup() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceProvider repositoryOverride={demoRepository}>
        <BulkCreatePage />
      </WorkspaceProvider>
    </QueryClientProvider>,
  );
}
it("pastes multiple stories, creates a batch, and clears all fields without persisting drafts", async () => {
  const user = userEvent.setup();
  setup();
  await screen.findByRole("option", { name: "OMS" });
  expect(
    screen.queryByRole("heading", { name: "Create stories" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Shared settings" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Review batch" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Export" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Paste SRS requirements"),
  ).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Destination project"), "OMS");
  await screen.findByRole("option", { name: /Manufacturing Operations/ });
  await user.selectOptions(screen.getByLabelText("Epic"), "100");
  await user.selectOptions(screen.getByLabelText("Parent Feature"), "120");
  await user.selectOptions(
    screen.getByLabelText("Assign all to"),
    "ahmed@example.com",
  );
  await user.selectOptions(
    screen.getByLabelText("Destination", { exact: true }),
    "backlog",
  );
  await user.type(
    screen.getByLabelText("Paste SRS requirements"),
    "SRS.1.1 Print report\nSRS.1.2 Search devices",
  );
  await user.click(
    screen.getByRole("button", { name: "Add 2 stories to batch" }),
  );
  expect(screen.getByLabelText("Paste SRS requirements")).toHaveValue("");
  expect(screen.getByLabelText("Story 1 task 1 title")).toHaveValue(
    "Implement frontend requirements",
  );
  expect(
    Object.keys(localStorage).some(
      (key) => key.endsWith(":batch") || key.includes(":results:"),
    ),
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "Review batch" }));
  await user.click(
    screen.getByRole("button", { name: "Create 2 stories + 18 tasks" }),
  );
  await screen.findByText(/20 of 20 items created/);
  expect(screen.getByLabelText("Destination project")).toHaveValue("");
  expect(
    screen.queryByLabelText("Paste SRS requirements"),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Assign all to")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Story 1 title")).not.toBeInTheDocument();
});

it("waits for project workspace loading before showing any creation controls", async () => {
  const metadata = await demoRepository.metadata();
  let resolve!: (value: typeof metadata) => void;
  vi.spyOn(demoRepository, "metadata").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup();
  setup();
  await screen.findByRole("option", { name: "OMS" });
  await user.selectOptions(screen.getByLabelText("Destination project"), "OMS");
  await screen.findByText("Loading project workspace…");
  expect(
    screen.queryByLabelText("Paste SRS requirements"),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Epic")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Import" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Review batch" }),
  ).not.toBeInTheDocument();
  await act(async () => resolve(metadata));
  await screen.findByLabelText("Paste SRS requirements");
  expect(screen.getByLabelText("Epic")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Review batch" }),
  ).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Destination project"), "");
  expect(
    screen.queryByRole("heading", { name: "Create stories" }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Epic")).not.toBeInTheDocument();
});
it("clears legacy creation storage and never restores the creation form on reopening", async () => {
  localStorage.setItem(
    "taskflow:v1:demo:batch",
    JSON.stringify({ stories: [{ title: "Old requirement" }] }),
  );
  const view = setup();
  await screen.findByRole("option", { name: "OMS" });
  expect(localStorage.getItem("taskflow:v1:demo:batch")).toBeNull();
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Destination project"), "OMS");
  await screen.findByLabelText("Paste SRS requirements");
  await user.type(
    screen.getByLabelText("Paste SRS requirements"),
    "SRS.9.1 Pending text",
  );
  view.unmount();
  setup();
  await screen.findByRole("option", { name: "OMS" });
  expect(
    screen.queryByLabelText("Paste SRS requirements"),
  ).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Destination project"), "OMS");
  expect(await screen.findByLabelText("Paste SRS requirements")).toHaveValue(
    "",
  );
});

it("shared task titles update existing and later stories while preserving individual overrides", async () => {
  const user = userEvent.setup();
  setup();
  await screen.findByRole("option", { name: "OMS" });
  await user.selectOptions(screen.getByLabelText("Destination project"), "OMS");
  const paste = await screen.findByLabelText("Paste SRS requirements");
  const frontend = screen.getByRole("region", {
    name: "Frontend shared tasks",
  });
  const backend = screen.getByRole("region", { name: "Backend shared tasks" });
  expect(within(frontend).getAllByRole("textbox")).toHaveLength(4);
  expect(within(backend).getAllByRole("textbox")).toHaveLength(4);
  await user.type(paste, "SRS.1 First story\nSRS.2 Second story");
  await user.click(
    screen.getByRole("button", { name: "Add 2 stories to batch" }),
  );
  const shared = screen.getByLabelText(
    "Shared title — Frontend implementation",
  );
  await user.clear(shared);
  await user.type(shared, "Build frontend screens");
  expect(screen.getByLabelText("Story 1 task 1 title")).toHaveValue(
    "Build frontend screens",
  );
  expect(screen.getByLabelText("Story 2 task 1 title")).toHaveValue(
    "Build frontend screens",
  );
  await user.clear(screen.getByLabelText("Story 1 task 1 title"));
  await user.type(
    screen.getByLabelText("Story 1 task 1 title"),
    "Custom screen",
  );
  await user.clear(shared);
  await user.type(shared, "Implement frontend screens");
  expect(screen.getByLabelText("Story 1 task 1 title")).toHaveValue(
    "Custom screen",
  );
  expect(screen.getByLabelText("Story 2 task 1 title")).toHaveValue(
    "Implement frontend screens",
  );
  await user.click(
    screen.getByRole("button", { name: "Add more requirements" }),
  );
  await user.type(paste, "SRS.3 Third story");
  await user.click(
    screen.getByRole("button", { name: "Add 1 stories to batch" }),
  );
  expect(screen.getByLabelText("Story 3 task 1 title")).toHaveValue(
    "Implement frontend screens",
  );
  await user.click(
    screen.getByRole("button", {
      name: "Restore shared title for story 1 task 1",
    }),
  );
  expect(screen.getByLabelText("Story 1 task 1 title")).toHaveValue(
    "Implement frontend screens",
  );
});

it("removes a shared task from existing and later standard stories", async () => {
  const user = userEvent.setup();
  setup();
  await screen.findByRole("option", { name: "OMS" });
  await user.selectOptions(screen.getByLabelText("Destination project"), "OMS");
  const paste = await screen.findByLabelText("Paste SRS requirements");
  await user.type(paste, "SRS.1 First story\nSRS.2 Second story");
  await user.click(
    screen.getByRole("button", { name: "Add 2 stories to batch" }),
  );

  await user.click(
    screen.getByRole("button", {
      name: /Remove shared task.*Frontend implementation/,
    }),
  );

  expect(
    screen.queryByLabelText("Shared title â€” Frontend implementation"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Story 1 task 9 title"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Story 2 task 9 title"),
  ).not.toBeInTheDocument();
  expect(screen.getAllByLabelText(/Story [12] task \d+ title/)).toHaveLength(
    16,
  );

  await user.click(
    screen.getByRole("button", { name: "Add more requirements" }),
  );
  await user.type(paste, "SRS.3 Third story");
  await user.click(
    screen.getByRole("button", { name: "Add 1 stories to batch" }),
  );
  expect(
    screen.queryByLabelText("Story 3 task 9 title"),
  ).not.toBeInTheDocument();
  expect(screen.getAllByLabelText(/Story 3 task \d+ title/)).toHaveLength(8);
});
