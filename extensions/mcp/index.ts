import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { McpService } from "./src/service.ts";
import { loadMcpSettings } from "./src/config.ts";
import { registerMcpCommands } from "./src/commands.ts";
import { getPrompt } from "./src/resources.ts";
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

  pi.on("input", async (event) => {
    const match = event.text.trim().match(/^\/([A-Za-z0-9_-]+)(?:\s+(.*))?$/s);
    if (!match) return { action: "continue" };
    const [, commandName, rawArgs] = match;
    const service = await servicePromise;
    const prompt = service.getPrompts().find((p) => p.prompt.name === commandName || p.key.endsWith(`:${commandName}`));
    const client = prompt && service.getClient(prompt.serverName);
    if (!prompt || !client) return { action: "continue" };
    const args = parsePromptArgs(rawArgs ?? "");
    const result = await getPrompt(client, prompt.prompt.name, args);
    return { action: "transform", text: promptResultToText(result) };
  });
}

function parsePromptArgs(input: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const part of input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx);
    const value = part.slice(idx + 1).replace(/^("|')|("|')$/g, "");
    args[key] = value;
  }
  return args;
}

function promptResultToText(result: any): string {
  const messages = result?.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) return JSON.stringify(result, null, 2);
  return messages.map((message: any) => {
    const role = message.role ? `${message.role}:\n` : "";
    const content = Array.isArray(message.content) ? message.content : [message.content];
    const text = content.map((part: any) => {
      if (typeof part === "string") return part;
      if (part?.type === "text") return part.text ?? "";
      if (part?.text) return part.text;
      return JSON.stringify(part);
    }).filter(Boolean).join("\n");
    return `${role}${text}`;
  }).filter(Boolean).join("\n\n");
}
