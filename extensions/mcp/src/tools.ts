import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { McpService } from "./service.ts";
import type { CachedTool } from "./types.ts";
import { withTimeout } from "./util.ts";
import { normalizeMcpResult, summarizeMcpResult } from "./result.ts";

export function sanitizeName(name: string): string { return name.replace(/[^a-zA-Z0-9_-]/g, "_"); }

function parameterSchema(schema: any) {
  const s = schema && typeof schema === "object" ? structuredClone(schema) : { type: "object", properties: {} };
  s.type = "object"; s.properties ??= {}; s.additionalProperties = false;
  return Type.Unsafe(s);
}

export function toPiTool(service: McpService, cached: CachedTool): ToolDefinition<any, any> {
  return {
    name: cached.piName,
    label: `MCP ${cached.serverName}:${cached.tool.name}`,
    description: cached.tool.description ?? "",
    promptSnippet: `MCP tool ${cached.serverName}:${cached.tool.name}.`,
    parameters: parameterSchema(cached.tool.inputSchema),
    renderShell: "self",
    renderCall(_args, theme) {
      return new Text(`${theme.fg("toolTitle", theme.bold("mcp "))}${theme.fg("accent", `${cached.serverName}:${cached.tool.name}`)}`, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "MCP running…"), 0, 0);
      const summary = summarizeMcpResult(result.details ?? result);
      const status = summary.isError ? theme.fg("error", "error") : theme.fg("success", "done");
      const bits = [`${summary.partCount} part${summary.partCount === 1 ? "" : "s"}`];
      if (summary.textLength) bits.push(`${summary.textLength} chars`);
      if (summary.imageCount) bits.push(`${summary.imageCount} image${summary.imageCount === 1 ? "" : "s"}`);
      if (summary.resourceCount) bits.push(`${summary.resourceCount} resource${summary.resourceCount === 1 ? "" : "s"}`);
      let text = `${status} ${theme.fg("dim", bits.join(", "))}`;
      if (expanded) {
        const contentText = result.content?.filter((p: any) => p?.type === "text").map((p: any) => p.text).join("\n") || summary.textPreview;
        text += contentText ? `\n${theme.fg("dim", contentText.slice(0, 4000))}${contentText.length > 4000 ? "\n[truncated]" : ""}` : "";
      } else if (summary.textPreview) {
        text += theme.fg("muted", ` — ${summary.textPreview}`);
      }
      return new Text(text, 0, 0);
    },
    async execute(_toolCallId, params, signal) {
      const client = service.getClient(cached.serverName);
      if (!client) throw new Error(`MCP server not connected: ${cached.serverName}`);
      const cfg = service.config[cached.serverName];
      const result = await withTimeout((client as any).callTool({ name: cached.tool.name, arguments: params ?? {} }, undefined, { signal, resetTimeoutOnProgress: true }), service.timeout(cfg), `MCP tool timed out: ${cached.piName}`);
      return normalizeMcpResult(result);
    },
  };
}
