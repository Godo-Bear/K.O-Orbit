/**
 * K.O Orbit — Cloudflare Worker entry.
 * Serves the static Vite build (via the `assets` binding) and relays online
 * room traffic through a Durable Object per room code (max 10 players).
 */
const MAX_PLAYERS = 10;

interface Env { ROOMS: any; ASSETS: any }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
      const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (!code) return new Response('Bad room', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

type Att = { id: number; name: string; host: boolean };

export class RoomDO {
  ctx: any;
  constructor(ctx: any, _env: Env) { this.ctx = ctx; }

  private peers(): { ws: WebSocket; a: Att }[] {
    return this.ctx.getWebSockets().map((ws: any) => ({ ws, a: ws.deserializeAttachment() as Att })).filter((p: any) => p.a);
  }

  private broadcastPeers() {
    const ps = this.peers();
    const list = ps.map((p) => p.a);
    for (const p of ps) { try { p.ws.send(JSON.stringify({ t: 'peers', list, you: p.a.id })); } catch { /* ignore */ } }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pair = new (globalThis as any).WebSocketPair();
    const client = pair[0], server = pair[1];
    const ps = this.peers();
    const creating = url.searchParams.get('create') === '1';
    const fail = (reason: string) => {
      server.accept();
      server.send(JSON.stringify({ t: 'error', reason }));
      server.close(1000, reason);
      return new Response(null, { status: 101, webSocket: client } as any);
    };
    if (ps.length === 0 && !creating) return fail('not-found');
    if (ps.length > 0 && creating) return fail('exists');
    if (ps.length >= MAX_PLAYERS) return fail('full');
    this.ctx.acceptWebSocket(server);
    const id = ps.reduce((m, p) => Math.max(m, p.a.id), 0) + 1;
    const att: Att = { id, name: (url.searchParams.get('name') || 'Player').slice(0, 16), host: ps.length === 0 };
    server.serializeAttachment(att);
    this.broadcastPeers();
    return new Response(null, { status: 101, webSocket: client } as any);
  }

  async webSocketMessage(ws: any, raw: string | ArrayBuffer) {
    let m: any; try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (m.t === 'ping') { ws.send(JSON.stringify({ t: 'pong', ts: m.ts })); return; }
    if (m.t !== 'msg') return;
    const me = ws.deserializeAttachment() as Att;
    const out = JSON.stringify({ t: 'msg', from: me.id, data: m.data });
    for (const p of this.peers()) {
      if (p.a.id === me.id) continue;
      if (m.to === 'all' || (m.to === 'host' && p.a.host) || m.to === p.a.id) { try { p.ws.send(out); } catch { /* ignore */ } }
    }
  }

  async webSocketClose(ws: any) { this.onLeave(ws); }
  async webSocketError(ws: any) { this.onLeave(ws); }

  private onLeave(ws: any) {
    const me = ws.deserializeAttachment() as Att | null;
    try { ws.close(1000, 'bye'); } catch { /* already closed */ }
    if (!me) return;
    ws.serializeAttachment(null);
    const rest = this.peers().filter((p) => p.a.id !== me.id);
    if (me.host) {
      for (const p of rest) { try { p.ws.send(JSON.stringify({ t: 'error', reason: 'host-left' })); p.ws.serializeAttachment(null); p.ws.close(1000, 'host-left'); } catch { /* ignore */ } }
    } else this.broadcastPeers();
  }
}
