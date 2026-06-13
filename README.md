# pi-mcp

Model Context Protocol (MCP) extension for the Pi coding agent.

This Pi package connects configured local/remote MCP servers and exposes discovered MCP tools to Pi.

## Install


```sh
pi install git:github.com/cfuentessalgado/pi-mcp
```

For local development, you can run Pi with the extension directly:

```sh
pi -e ./extensions/mcp
```

## Configuration

Configure servers in `~/.pi/agent/settings.json` or project `.pi/settings.json` under top-level `mcp`:

```jsonc
{
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["node", "server.js"],
      "cwd": ".",
      "environment": { "EXAMPLE_KEY": "YOUR_VALUE_HERE" },
      "enabled": true,
      "timeout": 30000
    },
    "linear": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": { "X-Api-Key": "YOUR_API_KEY_HERE" },
      "oauth": {
        "callbackPort": 19876,
        "scope": "read"
      },
      "enabled": true
    }
  },
  "experimental": {
    "mcp_timeout": 30000
  }
}
```

## Commands

- `/mcp list` — show configured servers and connection status.
- `/mcp add NAME --url URL --header KEY=VALUE` — add a remote server to project settings by default.
- `/mcp add NAME -- command arg1 arg2 --env KEY=VALUE` — add a local stdio server.
- `/mcp auth NAME`, `/mcp auth list`, `/mcp logout NAME`, `/mcp debug NAME` — OAuth/status helpers.
- `/mcp prompts`, `/mcp get-prompt KEY`, `/mcp resources`, `/mcp read-resource KEY` — prompt/resource helpers.

## Notes

- OAuth credentials are stored outside this repo at `~/.pi/agent/mcp-auth.json` with mode `0600`.
- Do not commit real MCP headers, OAuth client secrets, tokens, or private server URLs.
- MCP server startup happens in the background after Pi session start, so slow servers should not block Pi startup.
- Tool results render compactly by default; expand a tool result in Pi to inspect full output.
