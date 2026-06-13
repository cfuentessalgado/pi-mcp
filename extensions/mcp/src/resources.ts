import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

type PageFn = (params?: { cursor?: string }) => Promise<any>;

async function paginate(label: string, field: string, pageFn: PageFn): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 1000; page++) {
    if (cursor) { if (seen.has(cursor)) throw new Error(`Duplicate MCP cursor for ${label}`); seen.add(cursor); }
    const res = await pageFn(cursor ? { cursor } : undefined);
    out.push(...(res?.[field] ?? []));
    cursor = res?.nextCursor;
    if (!cursor) return out;
  }
  throw new Error(`MCP pagination exceeded 1000 pages for ${label}`);
}

export async function listAllTools(client: Client): Promise<any[]> {
  return await paginate("tools/list", "tools", (params) => client.listTools(params));
}
export async function listAllPrompts(client: Client): Promise<any[]> { return await paginate("prompts/list", "prompts", (params) => client.listPrompts(params)); }
export async function listAllResources(client: Client): Promise<any[]> { return await paginate("resources/list", "resources", (params) => client.listResources(params)); }
export async function getPrompt(client: Client, name: string, args?: Record<string, unknown>) { return await (client as any).getPrompt({ name, arguments: args ?? {} }); }
export async function readResource(client: Client, uri: string) { return await (client as any).readResource({ uri }); }
