import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ToolListChangedNotificationSchema, LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpConfigMap, McpServerConfig, McpSettings, McpStatus, CachedTool, CachedPrompt, CachedResource } from "./types.ts";
import { defaultTimeout } from "./config.ts";
import { connectLocal } from "./local.ts";
import { connectRemote } from "./remote.ts";
import { listAllPrompts, listAllResources, listAllTools } from "./resources.ts";
import { sanitizeName } from "./tools.ts";
import { withTimeout } from "./util.ts";

export class McpService {
  readonly cwd: string;
  readonly settings: McpSettings;
  config: McpConfigMap;
  status = new Map<string, McpStatus>();
  clients = new Map<string, Client>();
  defs = new Map<string, any[]>();
  prompts = new Map<string, any[]>();
  resources = new Map<string, any[]>();
  pendingOAuthTransports = new Map<string, any>();
  pendingOAuthProviders = new Map<string, any>();
  private listeners = new Set<() => void>();
  private initializePromise?: Promise<void>;

  constructor(opts: { cwd: string; settings: McpSettings }) { this.cwd = opts.cwd; this.settings = opts.settings; this.config = opts.settings.mcp ?? {}; }
  timeout(cfg: McpServerConfig) { return defaultTimeout(this.settings, cfg); }

  async initialize() {
    this.initializePromise ??= Promise.all(Object.entries(this.config).map(([n, c]) => this.connectAndStore(n, c))).then(() => undefined);
    await this.initializePromise;
  }

  async connectAndStore(name: string, cfg: McpServerConfig) {
    if (cfg.enabled === false) { this.status.set(name, { state: "disabled" }); return; }
    try {
      const result = cfg.type === "local" ? await connectLocal(name, cfg, this.cwd, this.timeout(cfg)) : await connectRemote(name, cfg, this.timeout(cfg), this);
      this.status.set(name, result.status);
      if (result.client) {
        this.clients.set(name, result.client);
        await this.refreshServerCaches(name, result.client);
        this.watchClient(name, result.client);
      }
    } catch (e) { this.status.set(name, { state: "failed", error: e instanceof Error ? e.message : String(e) }); }
  }

  async refreshServerCaches(name: string, client = this.clients.get(name)) {
    if (!client) return;
    const cfg = this.config[name];
    const timeout = cfg ? this.timeout(cfg) : 30_000;
    this.defs.set(name, await withTimeout(listAllTools(client), timeout, `MCP tools/list timed out for ${name}`).catch(() => []));
    this.prompts.set(name, await withTimeout(listAllPrompts(client), timeout, `MCP prompts/list timed out for ${name}`).catch(() => []));
    this.resources.set(name, await withTimeout(listAllResources(client), timeout, `MCP resources/list timed out for ${name}`).catch(() => []));
  }

  watchClient(name: string, client: any) {
    client.setNotificationHandler?.(ToolListChangedNotificationSchema, async () => { await this.refreshServerCaches(name); this.emitToolsChanged(); });
    client.setNotificationHandler?.(LoggingMessageNotificationSchema, async (notification: any) => {
      // Keep the handler installed so MCP logging notifications do not surface as unhandled noise.
      console.debug?.(`[mcp:${name}] ${notification.params?.level ?? "log"}: ${notification.params?.data ?? ""}`);
    });
    client.onclose = () => { this.clients.delete(name); this.defs.delete(name); this.status.set(name, { state: "failed", error: "Connection closed" }); this.emitToolsChanged(); };
  }

  getTools(): CachedTool[] { const out: CachedTool[] = []; for (const [serverName, tools] of this.defs) for (const tool of tools) out.push({ serverName, tool, piName: `${sanitizeName(serverName)}_${sanitizeName(tool.name)}` }); return out; }
  getPrompts(): CachedPrompt[] { const out: CachedPrompt[] = []; for (const [serverName, prompts] of this.prompts) for (const prompt of prompts) out.push({ serverName, prompt, key: `${sanitizeName(serverName)}:${sanitizeName(prompt.name)}` }); return out; }
  getResources(): CachedResource[] { const out: CachedResource[] = []; for (const [serverName, resources] of this.resources) for (const resource of resources) out.push({ serverName, resource, key: `${sanitizeName(serverName)}:${sanitizeName(resource.name ?? resource.uri)}` }); return out; }
  getClient(name: string) { return this.clients.get(name); }
  statusSummary() { const connected = [...this.status.values()].filter(s => s.state === "connected").length; const total = this.status.size; return total ? `MCP ${connected}/${total}` : undefined; }
  onToolsChanged(fn: () => void) { this.listeners.add(fn); }
  emitToolsChanged() { for (const fn of this.listeners) fn(); }
  async shutdown() { for (const t of this.pendingOAuthTransports.values()) await t.close?.().catch?.(() => {}); for (const c of this.clients.values()) await c.close().catch(() => {}); this.clients.clear(); }
}
