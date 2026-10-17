# usehourly-mcp

A stdio bridge to the [UseHourly](https://usehourly.app) MCP server, for MCP clients that cannot connect to a remote HTTP server. If your client supports remote servers, use `https://usehourly.app/api/mcp` directly instead.

1. In UseHourly, open **Account > AI assistants** and make a token (read-only or read and change).
2. Add the server to your client. For Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "usehourly": {
      "command": "npx",
      "args": ["-y", "usehourly-mcp"],
      "env": { "USEHOURLY_API_TOKEN": "uh_..." }
    }
  }
}
```

This package is [`usehourly-mcp` on npm](https://www.npmjs.com/package/usehourly-mcp) (published by the UseHourly maintainers, MIT). To run it from a clone of this repo instead, use `"command": "node"` and point `args` at `bridge/index.mjs`.

## How it works

- No dependencies, Node 18 or newer.
- The handshake and the lists of tools, resources and prompts are answered locally from `catalog.json`, so a client can inspect the server without a working token.
- `tools/call`, `resources/read` and `prompts/get` are sent to the hosted server with your token as the bearer token. Every call runs as the token's owner.
- `USEHOURLY_MCP_URL` points the bridge at another server (default `https://usehourly.app/api/mcp`). It must be https (plain http only for localhost), and redirects are refused, so the token never leaves for another address.

`catalog.json` is generated from the server's real definitions (`npm run mcp:catalog` in the repo root); a test fails if it goes stale. The list of tools is baked into each published version, so a new tool shows up for `npx` users only after a new version is published (calls always go to the live server).
