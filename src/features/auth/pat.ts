import type { AuthAccount, AuthSession } from "./types";

/** A PAT is kept only in memory, never in browser storage or draft exports. */
export class PatAuth implements AuthSession {
  private identity?: AuthAccount;
  private secret: string;
  constructor(token: string) {
    this.secret = token.trim();
    if (!this.secret || !/^[A-Za-z0-9]+$/.test(this.secret))
      throw new Error("Enter a valid Azure DevOps personal access token.");
  }
  async authorizationHeader() {
    if (!this.secret) throw new Error("Enter your token again in Settings.");
    return `Basic ${btoa(`:${this.secret}`)}`;
  }
  async identify(organization: string) {
    let response: Response;
    try {
      response = await fetch(
        `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/connectionData?connectOptions=1&lastChangeId=-1&lastChangeId64=-1`,
        { headers: { Authorization: await this.authorizationHeader() } },
      );
    } catch {
      throw new Error(
        "Network or browser CORS error. Check Azure API access from this app.",
      );
    }
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "Token is invalid, expired or revoked. Enter a new token."
          : "Azure denied this connection. Check your organization and permissions.",
      );
    const data = await response.json();
    const user = data.authenticatedUser;
    const username = user?.properties?.Account?.$value;
    if (!user?.id || !username || user.isActive === false)
      throw new Error(
        "Azure did not return an authenticated user for this token.",
      );
    this.identity = {
      username,
      homeAccountId: user.id,
      name: user.providerDisplayName,
    };
    return this.identity;
  }
  async account() {
    return this.identity;
  }
  async logout() {
    this.secret = "";
    this.identity = undefined;
  }
}
