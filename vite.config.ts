import { defineConfig, type Plugin } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

/**
 * Dev/preview room relay that mirrors worker/index.ts (Cloudflare Durable Object).
 * Rooms are keyed by code; first joiner is host; hard cap of 10 players.
 */
const MAX_PLAYERS = 10;

function relayPlugin(): Plugin {
  type Peer = { ws: WebSocket; id: number; name: string; host: boolean };
  const rooms = new Map<string, { peers: Peer[]; nextId: number }>();
  const wss = new WebSocketServer({ noServer: true });

  const broadcastPeers = (code: string) => {
    const room = rooms.get(code);
    if (!room) return;
    const list = room.peers.map((p) => ({ id: p.id, name: p.name, host: p.host }));
    for (const p of room.peers) p.ws.send(JSON.stringify({ t: 'peers', list, you: p.id }));
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      const name = (url.searchParams.get('name') || 'Player').slice(0, 16);
      if (!code) { ws.send(JSON.stringify({ t: 'error', reason: 'bad-room' })); ws.close(); return; }
      let room = rooms.get(code);
      const creating = url.searchParams.get('create') === '1';
      if (!room) {
        if (!creating) { ws.send(JSON.stringify({ t: 'error', reason: 'not-found' })); ws.close(); return; }
        room = { peers: [], nextId: 1 };
        rooms.set(code, room);
      } else if (creating) { ws.send(JSON.stringify({ t: 'error', reason: 'exists' })); ws.close(); return; }
      if (room.peers.length >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'error', reason: 'full' })); ws.close(); return; }
      const peer: Peer = { ws, id: room.nextId++, name, host: room.peers.length === 0 };
      room.peers.push(peer);
      broadcastPeers(code);
      ws.on('message', (raw) => {
        let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
        if (m.t === 'ping') { ws.send(JSON.stringify({ t: 'pong', ts: m.ts })); return; }
        if (m.t !== 'msg') return;
        const out = JSON.stringify({ t: 'msg', from: peer.id, data: m.data });
        for (const p of room!.peers) {
          if (p === peer) continue;
          if (m.to === 'all' || (m.to === 'host' && p.host) || m.to === p.id) p.ws.send(out);
        }
      });
      ws.on('close', () => {
        const r = rooms.get(code); if (!r) return;
        r.peers = r.peers.filter((p) => p !== peer);
        if (peer.host) {
          for (const p of r.peers) { p.ws.send(JSON.stringify({ t: 'error', reason: 'host-left' })); p.ws.close(); }
          rooms.delete(code);
        } else if (r.peers.length === 0) rooms.delete(code);
        else broadcastPeers(code);
      });
    });
  };

  return {
    name: 'ko-orbit-relay',
    configureServer(server) { server.httpServer?.on('upgrade', onUpgrade); },
    configurePreviewServer(server) { server.httpServer?.on('upgrade', onUpgrade); },
  };
}

export default defineConfig({
  plugins: [relayPlugin()],
  server: { hmr: { path: '/__vite_hmr' } },
  build: { target: 'es2022', sourcemap: false },
});
