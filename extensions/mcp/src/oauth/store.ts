import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
export const AUTH_PATH = join(homedir(), ".pi", "agent", "mcp-auth.json");
export type AuthEntry = any;
export class McpAuthStore {
  path = AUTH_PATH;
  async read(): Promise<Record<string, AuthEntry>> { if (!existsSync(this.path)) return {}; return JSON.parse(await readFile(this.path, "utf8")); }
  async write(data: Record<string, AuthEntry>) { await mkdir(dirname(this.path), { recursive: true }); await writeFile(this.path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 }); await chmod(this.path, 0o600).catch(() => {}); }
  async getForUrl(name: string, serverUrl: string) { const d = await this.read(); return d[name]?.serverUrl === serverUrl ? d[name] : undefined; }
  async patch(name: string, serverUrl: string, patch: AuthEntry) { const d = await this.read(); d[name] = { ...(d[name] ?? {}), ...patch, serverUrl }; await this.write(d); }
  async delete(name: string) { const d = await this.read(); delete d[name]; await this.write(d); }
  async list() { return await this.read(); }
}
