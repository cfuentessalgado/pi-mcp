import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import type { LocalMcpConfig, McpStatus } from "./types.ts";
import { withTimeout } from "./util.ts";

function splitCommand(command: string): string[] {
  const matches = command.match(/(?:[^\s"']+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) ?? [];
  return matches.map((part) => part.replace(/^(["'])(.*)\1$/, "$2"));
}

export async function connectLocal(_name: string, cfg: LocalMcpConfig, workspace: string, timeout: number): Promise<{ status: McpStatus; client?: Client }> {
  const argv = typeof cfg.command === "string" ? splitCommand(cfg.command) : cfg.command;
  const [command, ...args] = argv;
  if (!command) return { status: { state: "failed", error: "Missing local MCP command" } };
  const env = { ...process.env, ...(cfg.environment ?? {}) } as Record<string, string>;
  if (command === "opencode") env.BUN_BE_BUN = "1";
  const transport = new StdioClientTransport({ command, args, cwd: cfg.cwd ? resolve(workspace, cfg.cwd) : workspace, env });
  const client = new Client({ name: "pi-mcp", version: "0.1.0" });
  try { await withTimeout(client.connect(transport), timeout, `MCP local server timed out after ${timeout}ms`); return { status: { state: "connected" }, client }; }
  catch (e) { await transport.close?.().catch(() => {}); return { status: { state: "failed", error: e instanceof Error ? e.message : String(e) } }; }
}
