import { afterEach, expect, it, vi } from "vitest";
import { PatAuth } from "./pat";
import { AzureRepository } from "../../shared/api/azure";
afterEach(() => vi.unstubAllGlobals());
it("identifies the PAT owner and uses Basic authentication for Azure requests", async () => {
  const fetcher = vi.fn(
    async (url: string, _options?: RequestInit) =>
      new Response(
        JSON.stringify(
          url.includes("connectionData")
            ? {
                authenticatedUser: {
                  id: "user-id",
                  providerDisplayName: "Ahmed",
                  properties: { Account: { $value: "ahmed@example.com" } },
                },
              }
            : { value: [{ id: "oms", name: "OMS" }] },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const auth = new PatAuth(" TestPAT123 ");
  expect(await auth.identify("company")).toMatchObject({
    username: "ahmed@example.com",
  });
  const repo = new AzureRepository(
    {
      mode: "azure",
      organization: "company",
      project: "OMS",
      team: "Team",
      clientId: "",
      tenantId: "",
    },
    auth,
  );
  expect(await repo.projects()).toEqual([{ id: "oms", name: "OMS" }]);
  for (const call of fetcher.mock.calls)
    expect((call[1] as RequestInit).headers).toEqual({
      Authorization: `Basic ${btoa(":TestPAT123")}`,
    });
  await auth.logout();
  expect(await auth.account()).toBeUndefined();
  await expect(repo.projects()).rejects.toThrow("Enter your token again");
});
it("rejects missing tokens, expired tokens, CORS failures and unauthenticated identities", async () => {
  expect(() => new PatAuth(" ")).toThrow();
  const auth = new PatAuth("TestPAT123");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 401 })),
  );
  await expect(auth.identify("company")).rejects.toThrow(
    "invalid, expired or revoked",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  await expect(auth.identify("company")).rejects.toThrow("CORS");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ authenticatedUser: { id: "anonymous" } }),
        ),
    ),
  );
  await expect(auth.identify("company")).rejects.toThrow("authenticated user");
});
