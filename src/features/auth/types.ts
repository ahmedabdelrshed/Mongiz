export interface AuthAccount {
  username: string;
  homeAccountId: string;
  name?: string;
}
export interface AuthSession {
  authorizationHeader(): Promise<string>;
  account(): Promise<AuthAccount | undefined>;
  logout(): Promise<void>;
}
