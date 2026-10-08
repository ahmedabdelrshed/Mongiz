import { demoRepository } from "../../shared/api/demo";
import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceProvider } from "../../app/Workspace";
import { BulkCreatePage } from "./BulkCreatePage";
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
  await screen.findByRole("heading", { name: "Create stories" });
  await screen.findByRole("option", { name: "OMS" });
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
  expect(screen.getByLabelText("Assign all to")).toHaveValue("");
  expect(screen.queryByLabelText("Story 1 title")).not.toBeInTheDocument();
});
it("clears legacy creation storage and never restores the creation form on reopening", async () => {
  localStorage.setItem(
    "taskflow:v1:demo:batch",
    JSON.stringify({ stories: [{ title: "Old requirement" }] }),
  );
  const view = setup();
  await screen.findByLabelText("Paste SRS requirements");
  expect(localStorage.getItem("taskflow:v1:demo:batch")).toBeNull();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Paste SRS requirements"),
    "SRS.9.1 Pending text",
  );
  view.unmount();
  setup();
  expect(await screen.findByLabelText("Paste SRS requirements")).toHaveValue(
    "",
  );
});
