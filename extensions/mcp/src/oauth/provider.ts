import { randomBytes } from "node:crypto";
import type { RemoteMcpConfig } from "../types.ts";
import { McpAuthStore } from "./store.ts";
export class McpOAuthProvider {
  store = new McpAuthStore(); authorizationUrl?: URL;
  constructor(public name: string, public cfg: RemoteMcpConfig) {}
  private oauthConfig() { return this.cfg.oauth && typeof this.cfg.oauth === "object" ? this.cfg.oauth : {}; }
  get redirectUrl() { const oauth = this.oauthConfig(); return new URL(oauth.redirectUri ?? `http://127.0.0.1:${oauth.callbackPort ?? 19876}/mcp/oauth/callback`); }
  get clientMetadata() { const oauth = this.oauthConfig(); return { client_name: "Pi MCP", client_uri: "https://pi.dev", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: oauth.clientSecret ? "client_secret_post" : "none", scope: oauth.scope }; }
  async clientInformation() { const oauth = this.oauthConfig(); if (oauth.clientId) return { client_id: oauth.clientId, client_secret: oauth.clientSecret }; return (await this.store.getForUrl(this.name, this.cfg.url))?.clientInfo; }
  async saveClientInformation(info: any) { await this.store.patch(this.name, this.cfg.url, { clientInfo: info }); }
  async tokens() { return (await this.store.getForUrl(this.name, this.cfg.url))?.tokens; }
  async saveTokens(tokens: any) { await this.store.patch(this.name, this.cfg.url, { tokens }); }
  async redirectToAuthorization(authorizationUrl: URL) { this.authorizationUrl = authorizationUrl; }
  async saveCodeVerifier(codeVerifier: string) { await this.store.patch(this.name, this.cfg.url, { codeVerifier }); }
  async codeVerifier() { return (await this.store.getForUrl(this.name, this.cfg.url))?.codeVerifier; }
  async state() { const e = await this.store.getForUrl(this.name, this.cfg.url); if (e?.oauthState) return e.oauthState; const oauthState = randomBytes(32).toString("hex"); await this.store.patch(this.name, this.cfg.url, { oauthState }); return oauthState; }
  async saveState(oauthState: string) { await this.store.patch(this.name, this.cfg.url, { oauthState }); }
  async invalidateCredentials(scope?: string) { const e = (await this.store.getForUrl(this.name, this.cfg.url)) ?? {}; if (scope === "tokens") delete e.tokens; else if (scope === "client") delete e.clientInfo; else { delete e.tokens; delete e.clientInfo; } await this.store.patch(this.name, this.cfg.url, e); }
}
