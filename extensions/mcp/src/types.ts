export type McpStatus =
  | { state: "connected" }
  | { state: "disabled" }
  | { state: "failed"; error: string }
  | { state: "needs_auth"; error?: string }
  | { state: "needs_client_registration"; error: string };

export type McpOAuthConfig = false | {
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  callbackPort?: number;
  redirectUri?: string;
};

export type LocalMcpConfig = {
  type: "local";
  /** Prefer argv arrays. String commands are accepted for compatibility and split with shell-like quoting. */
  command: string[] | string;
  cwd?: string;
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
};

export type RemoteMcpConfig = {
  type: "remote";
  url: string;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig;
  enabled?: boolean;
  timeout?: number;
};

export type McpServerConfig = LocalMcpConfig | RemoteMcpConfig;
export type McpConfigMap = Record<string, McpServerConfig>;

export type McpSettings = {
  mcp?: McpConfigMap;
  experimental?: { mcp_timeout?: number };
};

export type CachedTool = { serverName: string; tool: any; piName: string };
export type CachedPrompt = { serverName: string; prompt: any; key: string };
export type CachedResource = { serverName: string; resource: any; key: string };
