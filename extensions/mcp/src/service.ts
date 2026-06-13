import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ToolListChangedNotificationSchema, LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpConfigMap, McpServerConfig, McpSettings, McpStatus, CachedTool, CachedPrompt, CachedResource } from "./types.ts";
import { defaultTimeout } from "./config.ts";
import { connectLocal } from "./local.ts";
import { connectRemote, type PendingOAuth } from "./remote.ts";
import { catalogPrompts, catalogResources, catalogTools, discoverCatalog } from "./catalog.ts";

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
      const result: { status: McpStatus; client?: Client; pendingOAuth?: PendingOAuth } = cfg.type === "local"
        ? await connectLocal(name, cfg, this.cwd, this.timeout(cfg))
        : await connectRemote(name, cfg, this.timeout(cfg));
      if (result.pendingOAuth) {
        this.pendingOAuthTransports.set(name, result.pendingOAuth.transport);
        if (result.pendingOAuth.provider) this.pendingOAuthProviders.set(name, result.pendingOAuth.provider);
      }
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
    const catalog = await discoverCatalog(client, name, timeout);
    this.defs.set(name, catalog.tools);
    this.prompts.set(name, catalog.prompts);
    this.resources.set(name, catalog.resources);
  }

  watchClient(name: string, client: any) {
    client.setNotificationHandler?.(ToolListChangedNotificationSchema, async () => { await this.refreshServerCaches(name); this.emitToolsChanged(); });
    client.setNotificationHandler?.(LoggingMessageNotificationSchema, async (notification: any) => {
      // Keep the handler installed so MCP logging notifications do not surface as unhandled noise.
      console.debug?.(`[mcp:${name}] ${notification.params?.level ?? "log"}: ${notification.params?.data ?? ""}`);
    });
    client.onclose = () => { this.clients.delete(name); this.defs.delete(name); this.status.set(name, { state: "failed", error: "Connection closed" }); this.emitToolsChanged(); };
  }

  getTools(): CachedTool[] { return [...this.defs].flatMap(([serverName, tools]) => catalogTools(serverName, tools)); }
  getPrompts(): CachedPrompt[] { return [...this.prompts].flatMap(([serverName, prompts]) => catalogPrompts(serverName, prompts)); }
  getResources(): CachedResource[] { return [...this.resources].flatMap(([serverName, resources]) => catalogResources(serverName, resources)); }
  getClient(name: string) { return this.clients.get(name); }
  statusSummary() { const connected = [...this.status.values()].filter(s => s.state === "connected").length; const total = this.status.size; return total ? `MCP ${connected}/${total}` : undefined; }
  onToolsChanged(fn: () => void) { this.listeners.add(fn); }
  emitToolsChanged() { for (const fn of this.listeners) fn(); }
  async shutdown() { for (const t of this.pendingOAuthTransports.values()) await t.close?.().catch?.(() => {}); for (const c of this.clients.values()) await c.close().catch(() => {}); this.clients.clear(); }
}
