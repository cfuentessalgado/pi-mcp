import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CachedPrompt, CachedResource, CachedTool } from "./types.ts";
import { listAllPrompts, listAllResources, listAllTools } from "./resources.ts";
import { sanitizeName } from "./tools.ts";
import { withTimeout } from "./util.ts";

export type McpCatalogSnapshot = {
  tools: any[];
  prompts: any[];
  resources: any[];
};

async function discoverPart<T>(promise: Promise<T[]>, timeout: number, message: string): Promise<T[]> {
  return await withTimeout(promise, timeout, message).catch(() => []);
}

export async function discoverCatalog(client: Client, serverName: string, timeout: number): Promise<McpCatalogSnapshot> {
  const [tools, prompts, resources] = await Promise.all([
    discoverPart(listAllTools(client), timeout, `MCP tools/list timed out for ${serverName}`),
    discoverPart(listAllPrompts(client), timeout, `MCP prompts/list timed out for ${serverName}`),
    discoverPart(listAllResources(client), timeout, `MCP resources/list timed out for ${serverName}`),
  ]);
  return { tools, prompts, resources };
}

export function catalogTools(serverName: string, tools: any[]): CachedTool[] {
  return tools.map((tool) => ({ serverName, tool, piName: `${sanitizeName(serverName)}_${sanitizeName(tool.name)}` }));
}

export function catalogPrompts(serverName: string, prompts: any[]): CachedPrompt[] {
  return prompts.map((prompt) => ({ serverName, prompt, key: `${sanitizeName(serverName)}:${sanitizeName(prompt.name)}` }));
}

export function catalogResources(serverName: string, resources: any[]): CachedResource[] {
  return resources.map((resource) => ({ serverName, resource, key: `${sanitizeName(serverName)}:${sanitizeName(resource.name ?? resource.uri)}` }));
}
