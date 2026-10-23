import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceProvider } from "../../app/Workspace";
import { SettingsPage } from "./SettingsPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
function setup() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceProvider>
        <SettingsPage />
      </WorkspaceProvider>
    </QueryClientProvider>,
  );
}
it("connects with a PAT, persists only configuration, disconnects and requires a token after reload", async () => {
  const token = "MockSecretPAT123";
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes("connectionData"))
      return new Response(
        JSON.stringify({
          authenticatedUser: {
            id: "ahmed",
            properties: { Account: { $value: "ahmed@example.com" } },
          },
        }),
      );
    if (url.includes("/teams?"))
      return new Response(
        JSON.stringify({ value: [{ id: "team", name: "OMS Team" }] }),
      );
    if (url.includes("_apis/projects?"))
      return new Response(
        JSON.stringify({ value: [{ id: "oms", name: "OMS" }] }),
      );
    return new Response("{}", { status: 403 });
  });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  const view = setup();
  expect(screen.queryByLabelText("Tenant ID")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Organization name"), "company");
  await user.type(screen.getByLabelText(/^Personal access token/), token);
  await user.click(screen.getByRole("button", { name: "Connect with token" }));
  await screen.findByText(/Connected as ahmed/);
  expect(screen.getByLabelText(/^Personal access token/)).toHaveValue("");
  expect(
    screen.queryByLabelText("Project", { exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Team", { exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Use Azure workspace" }),
  ).not.toBeInTheDocument();
  expect(localStorage.getItem("taskflow:v1:settings")).toContain(
    '"authMethod":"pat"',
  );
  expect(JSON.stringify(localStorage)).not.toContain(token);
  expect(JSON.stringify(sessionStorage)).not.toContain(token);
  await user.click(screen.getByRole("button", { name: "Disconnect" }));
  await screen.findByText("Signed out.");
  view.unmount();
  setup();
  expect(
    screen.queryByRole("button", { name: "Disconnect" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText(/^Personal access token/)).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "Connect with token" }));
  expect(screen.getByText(/Enter a valid Azure/)).toBeInTheDocument();
});
