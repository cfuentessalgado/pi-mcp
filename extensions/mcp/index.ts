import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { McpService } from "./src/service.ts";
import { loadMcpSettings } from "./src/config.ts";
import { registerMcpCommands } from "./src/commands.ts";
import { toPiTool } from "./src/tools.ts";

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();
  const servicePromise = loadMcpSettings(cwd).then((settings) => new McpService({ cwd, settings }));
  const registered = new Set<string>();

  const registerDiscoveredTools = (service: McpService) => {
    for (const cached of service.getTools()) {
      if (registered.has(cached.piName)) continue;
      registered.add(cached.piName);
      pi.registerTool(toPiTool(service, cached));
    }
  };

  servicePromise.then((service) => registerMcpCommands(pi, service)).catch((error) => {
    console.error("[mcp] failed to load settings", error);
  });

  pi.on("session_start", async (_event, ctx) => {
    const service = await servicePromise;
    ctx.ui.setStatus("mcp", "MCP connecting…");
    void service.initialize().then(() => {
      registerDiscoveredTools(service);
      const summary = service.statusSummary();
      ctx.ui.setStatus("mcp", summary);
      ctx.ui.notify(`MCP initialized: ${summary ?? "no servers"}`, "info");
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.setStatus("mcp", "MCP failed");
      ctx.ui.notify(`MCP initialization failed: ${message}`, "error");
    });
  });

  pi.on("session_shutdown", async () => (await servicePromise).shutdown());
  servicePromise.then((service) => service.onToolsChanged(() => {
    registerDiscoveredTools(service);
    pi.events.emit("mcp.tools.changed", {});
  })).catch(() => {});
}
