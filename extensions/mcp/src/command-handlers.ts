import { addServerConfig } from "./config.ts";
import type { McpService } from "./service.ts";
import { McpAuthStore } from "./oauth/store.ts";
import { callbackServer } from "./oauth/callback.ts";
import { getPrompt, readResource } from "./resources.ts";
import { error, openUrl, optionValues, parseKeyValues, print } from "./command-support.ts";
import type { McpCommandHandler } from "./command-support.ts";

export function mcpCommandHandlers(service: McpService): Record<string, McpCommandHandler> {
  return {
    list: (_parts, ctx) => listServers(ctx, service),
    add: (parts, ctx) => addServer(parts, ctx),
    auth: (parts, ctx) => parts[0] === "list" ? authList(ctx, service) : authServer(parts, ctx, service),
    logout: (parts, ctx) => logout(parts, ctx),
    debug: (parts, ctx) => debugServer(parts, ctx, service),
    prompts: (_parts, ctx) => print(ctx, service.getPrompts().map(p => p.key).join("\n") || "No MCP prompts cached."),
    resources: (_parts, ctx) => print(ctx, service.getResources().map(r => `${r.key}\t${r.resource.uri}`).join("\n") || "No MCP resources cached."),
    "get-prompt": (parts, ctx) => getCachedPrompt(parts, ctx, service),
    "read-resource": (parts, ctx) => readCachedResource(parts, ctx, service),
  };
}

function listServers(ctx: any, service: McpService) {
  const lines = Object.entries(service.config).map(([n, c]: any) => `${n}\t${service.status.get(n)?.state ?? "unknown"}\t${c.type === "remote" ? c.url : c.command?.join(" ")}`);
  print(ctx, lines.join("\n") || "No MCP servers configured.");
}

async function addServer(parts: string[], ctx: any) {
  const scope = parts.includes("--global") ? "global" : "project";
  const name = parts.shift();
  if (!name) return error(ctx, "Usage: /mcp add NAME --url URL [--header K=V] OR /mcp add NAME -- command args...");
  let cfg: any;
  const urlIdx = parts.indexOf("--url");
  const dashIdx = parts.indexOf("--");
  if (urlIdx >= 0) {
    const url = parts[urlIdx + 1];
    const headers = parseKeyValues(optionValues(parts, "--header"));
    cfg = { type: "remote", url, headers, enabled: true };
  } else if (dashIdx >= 0) {
    const command = parts.slice(dashIdx + 1).filter(p => !p.startsWith("--env"));
    const env = parseKeyValues(optionValues(parts, "--env"));
    cfg = { type: "local", command, environment: env, enabled: true };
  } else return error(ctx, "Missing --url or -- command.");
  const path = await addServerConfig(name, cfg, scope as any);
  ctx.ui.notify(`Added MCP server ${name} to ${path}. Run /reload.`, "info");
}

async function authList(ctx: any, service: McpService) {
  const store = new McpAuthStore();
  const auth = await store.list();
  const lines = Object.entries(service.config)
    .filter(([, c]) => c.type === "remote" && c.oauth !== false)
    .map(([n, c]: any) => `${n}: ${auth[n]?.serverUrl === c.url && auth[n]?.tokens ? "authenticated" : service.status.get(n)?.state ?? "unknown"}`);
  print(ctx, lines.join("\n") || "No OAuth-capable MCP servers configured.");
}

async function logout(parts: string[], ctx: any) {
  const name = parts[0];
  if (!name) return error(ctx, "Usage: /mcp logout NAME");
  await new McpAuthStore().delete(name);
  callbackServer.cancelName(name);
  ctx.ui.notify(`Removed MCP credentials for ${name}.`, "info");
}

async function authServer(parts: string[], ctx: any, service: McpService) {
  const name = parts[0];
  if (!name) return error(ctx, "Usage: /mcp auth NAME");
  const cfg: any = service.config[name];
  if (!cfg || cfg.type !== "remote" || cfg.oauth === false) return error(ctx, "Server is not an OAuth-enabled remote MCP server.");
  if (!service.pendingOAuthTransports.get(name)) await service.connectAndStore(name, cfg);
  const transport = service.pendingOAuthTransports.get(name);
  const provider = service.pendingOAuthProviders.get(name);
  const url = provider?.authorizationUrl;
  if (!transport || !provider || !url) return error(ctx, `No pending OAuth authorization URL for ${name}. Current status: ${service.status.get(name)?.state ?? "unknown"}`);
  await callbackServer.listen(provider.redirectUrl?.toString?.());
  try { openUrl(url.toString()); ctx.ui.notify(`Opened browser to authorize ${name}.`, "info"); }
  catch { print(ctx, `Open this URL to authorize ${name}:\n${url.toString()}`); }
  try {
    const code = await callbackServer.wait(await provider.state(), name);
    await transport.finishAuth(code);
    service.pendingOAuthTransports.delete(name);
    service.pendingOAuthProviders.delete(name);
    await service.connectAndStore(name, cfg);
    ctx.ui.notify(`Authenticated ${name}. Status: ${service.status.get(name)?.state ?? "unknown"}`, "info");
  } catch (e) { error(ctx, `OAuth failed for ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}

function debugServer(parts: string[], ctx: any, service: McpService) {
  const name = parts[0];
  const cfg: any = name && service.config[name];
  if (!cfg) return error(ctx, "Unknown MCP server");
  return print(ctx, JSON.stringify({ config: { ...cfg, headers: cfg.headers ? "[redacted]" : undefined }, status: service.status.get(name) }, null, 2));
}

async function getCachedPrompt(parts: string[], ctx: any, service: McpService) {
  const key = parts[0];
  const p = service.getPrompts().find(x => x.key === key);
  const client = p && service.getClient(p.serverName);
  if (!p || !client) return error(ctx, "Prompt not found/connected");
  return print(ctx, JSON.stringify(await getPrompt(client, p.prompt.name), null, 2));
}

async function readCachedResource(parts: string[], ctx: any, service: McpService) {
  const key = parts[0];
  const r = service.getResources().find(x => x.key === key);
  const client = r && service.getClient(r.serverName);
  if (!r || !client) return error(ctx, "Resource not found/connected");
  return print(ctx, JSON.stringify(await readResource(client, r.resource.uri), null, 2));
}
