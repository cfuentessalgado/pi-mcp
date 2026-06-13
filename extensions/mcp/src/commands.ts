import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { McpService } from "./service.ts";
import { error, parseMcpCommand } from "./command-support.ts";
import { mcpCommandHandlers } from "./command-handlers.ts";
import { getMcpArgumentCompletions } from "./command-completions.ts";

export function registerMcpCommands(pi: ExtensionAPI, service: McpService) {
  const handlers = mcpCommandHandlers(service);
  pi.registerCommand("mcp", {
    description: "Manage MCP servers: list, add, auth, logout, debug, prompts, resources",
    getArgumentCompletions: getMcpArgumentCompletions,
    handler: async (args, ctx) => {
      const { cmd, parts } = parseMcpCommand(args);
      const handler = handlers[cmd];
      if (!handler) return error(ctx, "Unknown /mcp subcommand");
      return await handler(parts, ctx);
    },
  });
}
