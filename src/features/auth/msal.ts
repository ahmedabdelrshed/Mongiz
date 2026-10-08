import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
} from "@azure/msal-browser";
const scope = "499b84ac-1321-427f-aa17-267ca6975798/.default";
export class AzureAuth {
  private client: PublicClientApplication;
  private ready: Promise<void>;
  constructor(clientId: string, tenantId: string) {
    this.client = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    this.ready = this.client.initialize();
  }
  async account(): Promise<AccountInfo | undefined> {
    await this.ready;
    return this.client.getActiveAccount() ?? this.client.getAllAccounts()[0];
  }
  async login() {
    await this.ready;
    const r = await this.client.loginPopup({
      scopes: [scope],
      prompt: "select_account",
    });
    this.client.setActiveAccount(r.account);
    return r.account;
  }
  async token() {
    await this.ready;
    const account = await this.account();
    if (!account) throw new Error("Sign in to Microsoft before connecting.");
    try {
      return (
        await this.client.acquireTokenSilent({ account, scopes: [scope] })
      ).accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError)
        throw new Error(
          "Your Microsoft session needs approval. Use Sign in again, then retry.",
        );
      throw e;
    }
  }
  async logout() {
    await this.ready;
    await this.client.logoutPopup({
      account: await this.account(),
      postLogoutRedirectUri: window.location.origin,
    });
  }
  async authorizationHeader() {
    return `Bearer ${await this.token()}`;
  }
}
