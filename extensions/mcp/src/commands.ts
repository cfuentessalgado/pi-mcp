import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { addServerConfig, loadMcpSettings } from "./config.ts";
import type { McpService } from "./service.ts";
import { McpAuthStore } from "./oauth/store.ts";
import { callbackServer } from "./oauth/callback.ts";
import { getPrompt, readResource } from "./resources.ts";

function parseKeyValues(values: string[]) { const out: Record<string,string> = {}; for (const v of values) { const i = v.indexOf("="); if (i > 0) out[v.slice(0,i)] = v.slice(i+1); } return out; }
function print(ctx: ExtensionCommandContext, msg: string) { ctx.ui.notify(msg, "info"); }

async function authList(ctx: ExtensionCommandContext, service: McpService) {
  const store = new McpAuthStore(); const auth = await store.list();
  const lines = Object.entries(service.config).filter(([,c]) => c.type === "remote" && c.oauth !== false).map(([n,c]: any) => `${n}: ${auth[n]?.serverUrl === c.url && auth[n]?.tokens ? "authenticated" : service.status.get(n)?.state ?? "unknown"}`);
  print(ctx, lines.join("\n") || "No OAuth-capable MCP servers configured.");
}

export function registerMcpCommands(_pi: ExtensionAPI, service: McpService) {
  _pi.registerCommand("mcp", { description: "Manage MCP servers: list, add, auth, logout, debug, prompts, resources", handler: async (args, ctx) => {
    const parts = (args ?? "").trim().split(/\s+/).filter(Boolean); const cmd = parts.shift() ?? "list";
    if (cmd === "list") {
      const lines = Object.entries(service.config).map(([n,c]: any) => `${n}\t${service.status.get(n)?.state ?? "unknown"}\t${c.type === "remote" ? c.url : c.command?.join(" ")}`);
      return print(ctx, lines.join("\n") || "No MCP servers configured.");
    }
    if (cmd === "add") {
      const scope = parts.includes("--global") ? "global" : "project";
      const name = parts.shift(); if (!name) return ctx.ui.notify("Usage: /mcp add NAME --url URL [--header K=V] OR /mcp add NAME -- command args...", "error");
      let cfg: any;
      const urlIdx = parts.indexOf("--url"); const dashIdx = parts.indexOf("--");
      if (urlIdx >= 0) { const url = parts[urlIdx+1]; const headers = parseKeyValues(parts.flatMap((p,i)=>p==="--header" ? [parts[i+1]] : [])); cfg = { type: "remote", url, headers, enabled: true }; }
      else if (dashIdx >= 0) { const command = parts.slice(dashIdx+1).filter(p => !p.startsWith("--env")); const env = parseKeyValues(parts.flatMap((p,i)=>p==="--env" ? [parts[i+1]] : [])); cfg = { type: "local", command, environment: env, enabled: true }; }
      else return ctx.ui.notify("Missing --url or -- command.", "error");
      const path = await addServerConfig(name, cfg, scope as any); ctx.ui.notify(`Added MCP server ${name} to ${path}. Run /reload.`, "info"); return;
    }
    if (cmd === "auth" && parts[0] === "list") return authList(ctx, service);
    if (cmd === "logout") { const name = parts[0]; if (!name) return ctx.ui.notify("Usage: /mcp logout NAME", "error"); await new McpAuthStore().delete(name); callbackServer.cancelName(name); ctx.ui.notify(`Removed MCP credentials for ${name}.`, "info"); return; }
    if (cmd === "auth") { const name = parts[0]; if (!name) return ctx.ui.notify("Usage: /mcp auth NAME", "error"); const cfg: any = service.config[name]; if (!cfg || cfg.type !== "remote" || cfg.oauth === false) return ctx.ui.notify("Server is not an OAuth-enabled remote MCP server.", "error"); ctx.ui.notify(`If ${name} needs auth, run /mcp debug ${name} for status. Browser OAuth is implemented through the MCP SDK provider and callback server.`, "info"); return; }
    if (cmd === "debug") { const name = parts[0]; const cfg: any = name && service.config[name]; if (!cfg) return ctx.ui.notify("Unknown MCP server", "error"); return print(ctx, JSON.stringify({ config: { ...cfg, headers: cfg.headers ? "[redacted]" : undefined }, status: service.status.get(name) }, null, 2)); }
    if (cmd === "prompts") return print(ctx, service.getPrompts().map(p => p.key).join("\n") || "No MCP prompts cached.");
    if (cmd === "resources") return print(ctx, service.getResources().map(r => `${r.key}\t${r.resource.uri}`).join("\n") || "No MCP resources cached.");
    if (cmd === "get-prompt") { const key = parts[0]; const p = service.getPrompts().find(x=>x.key===key); const client = p && service.getClient(p.serverName); if (!p || !client) return ctx.ui.notify("Prompt not found/connected", "error"); return print(ctx, JSON.stringify(await getPrompt(client, p.prompt.name), null, 2)); }
    if (cmd === "read-resource") { const key = parts[0]; const r = service.getResources().find(x=>x.key===key); const client = r && service.getClient(r.serverName); if (!r || !client) return ctx.ui.notify("Resource not found/connected", "error"); return print(ctx, JSON.stringify(await readResource(client, r.resource.uri), null, 2)); }
    ctx.ui.notify("Unknown /mcp subcommand", "error");
  }});
}
