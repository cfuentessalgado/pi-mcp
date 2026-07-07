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
  parts = parts.filter(p => p !== "--global");
  const name = parts.shift();
  if (!name) return addServerWizard(ctx, scope);
  if (name.startsWith("--")) return addServerWizard(ctx, scope);
  let cfg: any;
  const urlIdx = parts.indexOf("--url");
  const dashIdx = parts.indexOf("--");
  if (urlIdx >= 0) {
    const url = parts[urlIdx + 1];
    if (!url) return error(ctx, "Missing URL after --url.");
    const headers = parseKeyValues(optionValues(parts, "--header"));
    cfg = { type: "remote", url, headers, enabled: true };
  } else if (dashIdx >= 0) {
    const command = parts.slice(dashIdx + 1).filter((p, i, a) => a[i - 1] !== "--env" && !p.startsWith("--env"));
    if (!command.length) return error(ctx, "Missing command after --.");
    const env = parseKeyValues(optionValues(parts, "--env"));
    cfg = { type: "local", command, environment: env, enabled: true };
  } else return addServerWizard(ctx, scope, name);
  const path = await addServerConfig(name, cfg, scope as any);
  ctx.ui.notify(`Added MCP server ${name} to ${path}. Run /reload.`, "info");
}

async function addServerWizard(ctx: any, initialScope: string, initialName?: string) {
  const name = initialName || await ctx.ui.input("MCP server name", "context7");
  if (!name) return;
  const type = await ctx.ui.select("MCP server type", ["Remote HTTP/SSE", "Local stdio"]);
  if (!type) return;
  const scopeChoice = await ctx.ui.select("Where should this be saved?", initialScope === "global" ? ["Global", "Project"] : ["Project", "Global"]);
  if (!scopeChoice) return;
  const scope = scopeChoice === "Global" ? "global" : "project";
  let cfg: any;
  if (type === "Remote HTTP/SSE") {
    const url = await ctx.ui.input("Remote MCP URL", "https://example.com/mcp");
    if (!url) return;
    const rawHeaders = await ctx.ui.input("Headers (optional, comma-separated KEY=VALUE)", "Authorization=Bearer ...");
    cfg = { type: "remote", url, headers: parseKeyValues(splitPairs(rawHeaders)), enabled: true };
  } else {
    const commandText = await ctx.ui.input("Command", "npx -y @modelcontextprotocol/server-filesystem .");
    if (!commandText) return;
    const rawEnv = await ctx.ui.input("Environment (optional, comma-separated KEY=VALUE)", "API_KEY=...");
    cfg = { type: "local", command: commandText.trim().split(/\s+/), environment: parseKeyValues(splitPairs(rawEnv)), enabled: true };
  }
  const path = await addServerConfig(name, cfg, scope as any);
  ctx.ui.notify(`Added MCP server ${name} to ${path}. Run /reload.`, "info");
}

function splitPairs(value?: string) {
  return (value ?? "").split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
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
