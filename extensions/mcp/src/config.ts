import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { applyEdits, modify, parse } from "jsonc-parser";
import type { McpConfigMap, McpServerConfig, McpSettings } from "./types.ts";

export const GLOBAL_SETTINGS = join(homedir(), ".pi", "agent", "settings.json");
export function projectSettingsPath(cwd: string) { return join(cwd, ".pi", "settings.json"); }

async function readJsonc(path: string): Promise<any> {
  if (!existsSync(path)) return {};
  return parse(await readFile(path, "utf8")) ?? {};
}

function deepMerge(a: any, b: any): any {
  if (!a || typeof a !== "object" || Array.isArray(a)) return b ?? a;
  if (!b || typeof b !== "object" || Array.isArray(b)) return b ?? a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = deepMerge(out[k], v);
  return out;
}

export async function loadMcpSettings(cwd: string): Promise<McpSettings> {
  const global = await readJsonc(GLOBAL_SETTINGS);
  const project = await readJsonc(projectSettingsPath(cwd));
  const merged = deepMerge(global, project);
  return { mcp: validateConfigMap(merged.mcp), experimental: merged.experimental };
}

export function defaultTimeout(settings: McpSettings, cfg?: { timeout?: number }) {
  return cfg?.timeout ?? settings.experimental?.mcp_timeout ?? 30_000;
}

export function validateConfigMap(value: unknown): McpConfigMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: McpConfigMap = {};
  for (const [name, cfg] of Object.entries(value as Record<string, any>)) {
    if (!cfg || typeof cfg !== "object") continue;
    if (cfg.type === "local" && ((Array.isArray(cfg.command) && cfg.command.length) || typeof cfg.command === "string")) out[name] = cfg as McpServerConfig;
    if (cfg.type === "remote" && typeof cfg.url === "string") out[name] = cfg as McpServerConfig;
  }
  return out;
}

export async function addServerConfig(name: string, cfg: McpServerConfig, scope: "global" | "project", cwd = process.cwd()) {
  const path = scope === "global" ? GLOBAL_SETTINGS : projectSettingsPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const oldText = existsSync(path) ? await readFile(path, "utf8") : "{}\n";
  const edits = modify(oldText, ["mcp", name], cfg, { formattingOptions: { insertSpaces: false, tabSize: 2 } });
  const text = applyEdits(oldText, edits);
  await writeFile(path, text.endsWith("\n") ? text : `${text}\n`, { mode: 0o600 });
  return path;
}
