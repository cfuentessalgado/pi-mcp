import { spawn } from "node:child_process";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export type McpCommandHandler = (parts: string[], ctx: ExtensionCommandContext) => Promise<void> | void;

export function parseMcpCommand(args?: string): { cmd: string; parts: string[] } {
  const parts = (args ?? "").trim().split(/\s+/).filter(Boolean);
  return { cmd: parts.shift() ?? "list", parts };
}

export function parseKeyValues(values: string[]) {
  const out: Record<string, string> = {};
  for (const v of values) {
    const i = v.indexOf("=");
    if (i > 0) out[v.slice(0, i)] = v.slice(i + 1);
  }
  return out;
}

export function optionValues(parts: string[], option: string) {
  return parts.flatMap((p, i) => p === option ? [parts[i + 1]] : []).filter((v): v is string => Boolean(v));
}

export function print(ctx: ExtensionCommandContext, msg: string) { ctx.ui.notify(msg, "info"); }
export function error(ctx: ExtensionCommandContext, msg: string) { ctx.ui.notify(msg, "error"); }

export function openUrl(url: string) {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}
