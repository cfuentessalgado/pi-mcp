import type { AutocompleteItem } from "@earendil-works/pi-tui";

const SUBCOMMANDS: AutocompleteItem[] = [
  { value: "list", label: "list", description: "Show configured MCP servers" },
  { value: "add ", label: "add", description: "add NAME --url URL [--header K=V] [--global] OR add NAME -- command args..." },
  { value: "auth ", label: "auth", description: "auth NAME OR auth list" },
  { value: "logout ", label: "logout", description: "Remove OAuth credentials for a server" },
  { value: "debug ", label: "debug", description: "Show redacted config and status for a server" },
  { value: "prompts", label: "prompts", description: "List cached MCP prompts" },
  { value: "resources", label: "resources", description: "List cached MCP resources" },
  { value: "get-prompt ", label: "get-prompt", description: "get-prompt SERVER:PROMPT" },
  { value: "read-resource ", label: "read-resource", description: "read-resource SERVER:RESOURCE" },
];

const ADD_FORMS: AutocompleteItem[] = [
  { value: "--url ", label: "--url", description: "Configure a remote MCP server" },
  { value: "-- ", label: "--", description: "Configure a local stdio MCP server" },
  { value: "--global", label: "--global", description: "Write to ~/.pi/agent/settings.json" },
  { value: "--header ", label: "--header", description: "Remote header, KEY=VALUE" },
  { value: "--env ", label: "--env", description: "Local environment variable, KEY=VALUE" },
];

export function getMcpArgumentCompletions(prefix: string): AutocompleteItem[] | null {
  const trimmed = prefix.trimStart();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1 && !trimmed.endsWith(" ")) {
    const needle = parts[0] ?? "";
    return SUBCOMMANDS.filter((item) => item.label?.startsWith(needle) || item.value.startsWith(needle)) || null;
  }

  const cmd = parts[0];
  const current = trimmed.endsWith(" ") ? "" : (parts.at(-1) ?? "");
  if (cmd === "add") return ADD_FORMS.filter((item) => item.value.startsWith(current) || item.label?.startsWith(current)) || null;
  if (cmd === "auth" && parts.length <= 2) return [{ value: "list", label: "list", description: "Show OAuth status for configured remote MCP servers" }];
  return null;
}
