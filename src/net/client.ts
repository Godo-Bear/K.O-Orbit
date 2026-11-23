import { MAX_PLAYERS } from '../core/constants';
import { save } from '../core/save';

export interface PeerInfo { id: number; name: string; host: boolean }

export type NetError = 'full' | 'not-found' | 'exists' | 'host-left' | 'bad-room' | 'connect-failed' | 'closed';

export const NET_ERROR_TEXT: Record<NetError, string> = {
  full: `Room is full (${MAX_PLAYERS}/${MAX_PLAYERS} players).`,
  'not-found': 'Room not found. Check the code and try again.',
  exists: 'That room code is already in use.',
  'host-left': 'The host left the room.',
  'bad-room': 'Invalid room code.',
  'connect-failed': 'Could not reach the online server.',
  closed: 'Connection closed.',
};

/** Resolves the relay WebSocket URL (same origin by default; overridable in Settings). */
export function relayUrl(room: string, name: string, create: boolean) {
  let base = save.settings.onlineServer.trim();
  if (!base) base = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  base = base.replace(/^http/, 'ws').replace(/\/+$/, '');
  const q = new URLSearchParams({ room, name });
  if (create) q.set('create', '1');
  return `${base}/ws?${q}`;
}

export function randomRoomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

/** Room client over a WebSocket relay (Cloudflare Durable Object or Vite dev relay). */
export class NetClient {
  ws: WebSocket | null = null;
  id = -1;
  peers: PeerInfo[] = [];
  latency: number | null = null;
  room = '';
  onPeers: (p: PeerInfo[]) => void = () => {};
  onMsg: (from: number, data: any) => void = () => {};
  onError: (e: NetError) => void = () => {};
  private pingTimer = 0;
  private closedByUs = false;
  bytesIn = 0; bytesOut = 0;

  get isHost() { return this.peers.find((p) => p.id === this.id)?.host ?? false; }
  get hostId() { return this.peers.find((p) => p.host)?.id ?? -1; }

  connect(room: string, name: string, create: boolean): Promise<void> {
    this.room = room;
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try { ws = new WebSocket(relayUrl(room, name, create)); } catch { reject('connect-failed'); return; }
      this.ws = ws;
      const to = window.setTimeout(() => { if (!settled) { settled = true; ws.close(); reject('connect-failed'); } }, 8000);
      ws.onmessage = (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : '';
        this.bytesIn += raw.length;
        let m: any; try { m = JSON.parse(raw); } catch { return; }
        if (m.t === 'peers') {
          this.peers = m.list; this.id = m.you;
          if (!settled) { settled = true; clearTimeout(to); resolve(); this.startPing(); }
          this.onPeers(this.peers);
        } else if (m.t === 'error') {
          if (!settled) { settled = true; clearTimeout(to); reject(m.reason); }
          else this.onError(m.reason);
          this.closedByUs = true;
        } else if (m.t === 'pong') {
          const rtt = performance.now() - m.ts;
          this.latency = this.latency == null ? rtt : this.latency * 0.7 + rtt * 0.3;
        } else if (m.t === 'msg') this.onMsg(m.from, m.data);
      };
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(to); reject('connect-failed'); } };
      ws.onclose = () => {
        clearInterval(this.pingTimer);
        if (!settled) { settled = true; clearTimeout(to); reject('connect-failed'); return; }
        if (!this.closedByUs) this.onError('closed');
      };
    });
  }

  private startPing() {
    clearInterval(this.pingTimer);
    const ping = () => this.raw({ t: 'ping', ts: performance.now() });
    ping();
    this.pingTimer = window.setInterval(ping, 1000);
  }

  private raw(o: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) { const s = JSON.stringify(o); this.bytesOut += s.length; this.ws.send(s); }
  }

  send(to: number | 'host' | 'all', data: unknown) { this.raw({ t: 'msg', to, data }); }

  close() {
    this.closedByUs = true;
    clearInterval(this.pingTimer);
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null; this.peers = []; this.id = -1; this.latency = null;
  }
}
