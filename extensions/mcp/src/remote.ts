import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { RemoteMcpConfig, McpStatus } from "./types.ts";
import { withTimeout, isAuthError, isClientRegistrationError, asError } from "./util.ts";
import { McpOAuthProvider } from "./oauth/provider.ts";

async function connectTransport(transport: any, timeout: number) {
  const client = new Client({ name: "pi-mcp", version: "0.1.0" });
  try { await withTimeout(client.connect(transport), timeout, `MCP remote server timed out after ${timeout}ms`); return client; }
  catch (e) { await transport.close?.().catch(() => {}); throw e; }
}

export type PendingOAuth = { transport: any; provider?: McpOAuthProvider };

export async function connectRemote(name: string, cfg: RemoteMcpConfig, timeout: number): Promise<{ status: McpStatus; client?: Client; pendingOAuth?: PendingOAuth }> {
  let url: URL;
  try { url = new URL(cfg.url); } catch { return { status: { state: "failed", error: "Invalid MCP URL" } }; }
  const requestInit = { headers: cfg.headers ?? {} } as any;
  const authProvider = cfg.oauth === false ? undefined : new McpOAuthProvider(name, cfg);
  let last: McpStatus = { state: "failed", error: "Unable to connect" };
  for (const Kind of [StreamableHTTPClientTransport, SSEClientTransport]) {
    let transport: any;
    try {
      transport = new (Kind as any)(url, { requestInit, authProvider });
      const client = await connectTransport(transport, timeout);
      return { status: { state: "connected" }, client };
    } catch (e) {
      if (isAuthError(e)) {
        if (isClientRegistrationError(e)) return { status: { state: "needs_client_registration", error: asError(e) } };
        return { status: { state: "needs_auth", error: asError(e) }, pendingOAuth: transport ? { transport, provider: authProvider } : undefined };
      }
      last = { state: "failed", error: asError(e) };
    }
  }
  return { status: last };
}
