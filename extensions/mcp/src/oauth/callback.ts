import http from "node:http";
export class OAuthCallbackServer {
  private server?: http.Server; private pending = new Map<string, { resolve:(code:string)=>void; reject:(e:Error)=>void; timer: any; name: string }>();
  port = 19876; path = "/mcp/oauth/callback";
  async listen(redirectUri?: string) {
    if (redirectUri) { const u = new URL(redirectUri); this.port = Number(u.port || 80); this.path = u.pathname; }
    if (this.server?.listening) return;
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>(resolve => this.server!.listen(this.port, "127.0.0.1", () => resolve()));
  }
  wait(state: string, name: string) { return new Promise<string>((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(state); reject(new Error("OAuth callback timed out")); }, 300000); this.pending.set(state, { resolve, reject, timer, name }); }); }
  cancelName(name: string) { for (const [s, p] of this.pending) if (p.name === name) { clearTimeout(p.timer); p.reject(new Error("OAuth cancelled")); this.pending.delete(s); } }
  private handle(req: http.IncomingMessage, res: http.ServerResponse) { const u = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`); const html = (s:string) => { res.writeHead(200, { "content-type": "text/html" }); res.end(s); };
    if (u.pathname !== this.path) { res.writeHead(404); return res.end("not found"); }
    const state = u.searchParams.get("state"); const p = state ? this.pending.get(state) : undefined;
    if (!state || !p) return html("<h1>OAuth error</h1><p>Unknown or missing state.</p>");
    if (u.searchParams.get("error")) { clearTimeout(p.timer); this.pending.delete(state); p.reject(new Error(u.searchParams.get("error")!)); return html("<h1>OAuth error</h1>"); }
    const code = u.searchParams.get("code"); if (!code) return html("<h1>OAuth error</h1><p>Missing code.</p>");
    clearTimeout(p.timer); this.pending.delete(state); p.resolve(code); html("<h1>OAuth complete</h1><p>You can return to Pi.</p>"); }
  async close() { for (const p of this.pending.values()) p.reject(new Error("OAuth server closed")); this.pending.clear(); await new Promise<void>(r => this.server?.close(() => r()) ?? r()); }
}
export const callbackServer = new OAuthCallbackServer();
