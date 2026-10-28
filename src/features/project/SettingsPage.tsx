import { useState } from "react";
import { useWorkspace } from "../../app/Workspace";
import { AzureRepository } from "../../shared/api/azure";
import { PatAuth } from "../auth/pat";
import type { AuthSession } from "../auth/types";
import { AzureAuth } from "../auth/msal";
import type { Settings } from "../../shared/api/types";
import { BusyIndicator, Notice, PageTitle } from "../../shared/ui/Common";
import { AppearanceSettings } from "../../app/Appearance";
import { Disclosure } from "../../shared/ui/Motion";
export function SettingsPage() {
  const w = useWorkspace();
  const [draft, setDraft] = useState({
    ...w.settings,
    authMethod: w.settings.authMethod ?? "microsoft",
  });
  const [client, setClient] = useState<AuthSession | undefined>(w.auth);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState(w.account);
  const [error, setError] = useState("");
  const change = (key: keyof Settings, value: string) =>
    setDraft((s) => ({ ...s, [key]: value }));
  const invalidate = () => {
    setClient(undefined);
    setIdentity("");
    setMessage("");
  };
  const signIn = async () => {
    setBusy(true);
    setError("");
    try {
      invalidate();
      if (!draft.organization.trim())
        throw new Error("Enter your organization name first.");
      let a: AuthSession;
      let username: string;
      if (draft.authMethod === "pat") {
        const pat = new PatAuth(token);
        try {
          username = (await pat.identify(draft.organization.trim())).username;
          await new AzureRepository(
            { ...draft, organization: draft.organization.trim() },
            pat,
          ).projects();
        } catch (e) {
          await pat.logout();
          throw e;
        }
        a = pat;
        setToken("");
      } else {
        if (!draft.clientId.trim() || !draft.tenantId.trim())
          throw new Error("Enter tenant ID and client ID first.");
        const microsoft = new AzureAuth(
          draft.clientId.trim(),
          draft.tenantId.trim(),
        );
        const account = await microsoft.login();
        if (!account) throw new Error("No account was selected.");
        username = account.username;
        await new AzureRepository(
          { ...draft, organization: draft.organization.trim() },
          microsoft,
        ).projects();
        a = microsoft;
      }
      setClient(a);
      setIdentity(username);
      w.setTargetProject("");
      w.setPatSession(draft.authMethod === "pat" ? a : undefined);
      w.setAccount(username);
      w.setSettings({
        ...draft,
        mode: "azure",
        organization: draft.organization.trim(),
        clientId: draft.clientId.trim(),
        tenantId: draft.tenantId.trim(),
        project: "",
        team: "",
      });
      setMessage(
        `Connected as ${username}. My Work loads all accessible projects. Choose the destination project only when creating stories.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        title="Workspace settings"
        subtitle="Connect your Azure DevOps organization to start managing work."
      />
      <AppearanceSettings />
      <div className="settings-grid">
        <section className="panel">
          <h2>Azure connection</h2>
          <p className="muted">
            Azure DevOps Services · My Work across all accessible projects
          </p>
          <label>
            Connection method
            <select
              value={draft.authMethod}
              disabled={busy}
              onChange={(e) => {
                change("authMethod", e.target.value);
                invalidate();
                setToken("");
              }}
            >
              <option value="pat">Personal access token (PAT)</option>
              <option value="microsoft">Microsoft sign-in</option>
            </select>
          </label>
          <div className="form-grid">
            <label className="span-2">
              Organization name
              <input
                value={draft.organization}
                disabled={busy}
                onChange={(e) => {
                  change("organization", e.target.value);
                  invalidate();
                }}
                placeholder="e.g. your-company"
              />
            </label>
            {draft.authMethod === "pat" ? (
              <label className="span-2">
                Personal access token
                <input
                  type="password"
                  autoComplete="off"
                  value={token}
                  disabled={busy}
                  placeholder="Paste your Azure DevOps PAT"
                  onChange={(e) => {
                    setToken(e.target.value);
                    invalidate();
                  }}
                />
                <span className="muted">
                  Kept only in memory. Enter it again after refreshing or
                  closing this page.
                </span>
              </label>
            ) : (
              <>
                <label>
                  Tenant ID
                  <input
                    value={draft.tenantId}
                    onChange={(e) => {
                      change("tenantId", e.target.value);
                      invalidate();
                    }}
                    placeholder="Microsoft Entra tenant ID"
                  />
                </label>
                <label>
                  Client ID
                  <input
                    value={draft.clientId}
                    onChange={(e) => {
                      change("clientId", e.target.value);
                      invalidate();
                    }}
                    placeholder="App registration client ID"
                  />
                </label>
              </>
            )}
          </div>
          <button
            className="primary"
            disabled={busy}
            aria-busy={busy}
            onClick={signIn}
          >
            {busy && <BusyIndicator />}
            {busy
              ? "Connecting…"
              : draft.authMethod === "pat"
                ? "Connect with token"
                : "Sign in with Microsoft"}
          </button>
          {error && <Notice tone="error">{error}</Notice>}
          {message && <Notice tone="success">{message}</Notice>}
        </section>
        <section className="panel">
          <Disclosure title="Setup checklist" defaultOpen={!w.account}>
            {draft.authMethod === "pat" ? (
              <ol className="checklist">
                <li>
                  In Azure DevOps, open User settings → Personal access tokens →
                  New Token.
                </li>
                <li>Select your organization and an expiration date.</li>
                <li>
                  Enable Work Items (Read &amp; write), Project and Team (Read),
                  and Graph (Read) to list all project users. Add Code (Read) to
                  select pull requests for linking tasks.
                </li>
                <li>
                  Copy the token, enter your organization name here, then click
                  Connect with token.
                </li>
                <li>
                  My Work loads all accessible projects. Choose the destination
                  project in Create Stories; its default team supplies
                  sprint/backlog options. Tenant ID and Client ID are not
                  needed.
                </li>
              </ol>
            ) : (
              <ol className="checklist">
                <li>
                  Register a single-page application in your company’s Microsoft
                  Entra tenant.
                </li>
                <li>
                  Add this exact redirect URI:{" "}
                  <code>{window.location.origin}</code>
                </li>
                <li>
                  Add Azure DevOps delegated permissions. Request tenant admin
                  consent if required.
                </li>
                <li>
                  Enter the organization name, tenant ID and app client ID. No
                  client secret is needed.
                </li>
                <li>
                  Sign in with your work account. Choose the destination project
                  only when creating stories.
                </li>
              </ol>
            )}
            <p className="muted">
              PATs stay in memory and are cleared on disconnect or page reload.
              Microsoft sessions use sessionStorage managed by MSAL. My Work
              edit drafts and preferences use localStorage. Creation fields stay
              in memory and clear when you leave the page or complete a batch.
            </p>
          </Disclosure>
          {(w.account || identity) && (
            <button
              onClick={async () => {
                await w.disconnect();
                if (client !== w.auth) await client?.logout();
                invalidate();
                setToken("");
                setMessage("Signed out.");
              }}
            >
              Disconnect
            </button>
          )}
        </section>
      </div>
    </>
  );
}
