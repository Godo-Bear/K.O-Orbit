import { MAX_PLAYERS, PLAYER_COLORS, playerLabel } from '../core/constants';
import { save, persist } from '../core/save';
import { DEVICE_IDS, deviceLabel, input } from '../core/input';
import { synth } from '../audio/synth';
import { CHARACTERS, charById } from '../sim/characters';
import { STAGES } from '../sim/stages';
import { drawPortrait } from '../render/rig';
import type { MatchRules, SlotConfig } from '../sim/types';
import { NetClient, NET_ERROR_TEXT, randomRoomCode, type NetError } from '../net/client';
import { isCharUnlocked } from '../story/campaign';
import { el, btn, cycler, toast, portraitCanvas, mount } from './dom';
import { stagePreview } from './versus';
import type { App } from './app';

interface LobbyPlayer { peerId: number; name: string; charId: string; cpu?: boolean; level?: number }
interface LobbyState { players: LobbyPlayer[]; stageId: string; mode: MatchRules['mode']; stocks: number; timeSec: number }

const local = { device: 'kb1', charId: 'nova' };

export function onlineMenuScreen(app: App): HTMLElement {
  const nameIn = el('input', { type: 'text', maxlength: '16', value: save.settings.playerName, 'data-nav': '', class: 'text-in' }) as HTMLInputElement;
  const codeIn = el('input', { type: 'text', maxlength: '8', placeholder: 'ROOM CODE', 'data-nav': '', class: 'text-in code' }) as HTMLInputElement;
  codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const status = el('div', { class: 'net-status' });
  const busy = (b: boolean) => root.classList.toggle('busy', b);

  const connect = async (create: boolean) => {
    const name = nameIn.value.trim() || 'Player';
    save.settings.playerName = name; persist();
    const code = create ? randomRoomCode() : codeIn.value.trim();
    if (!code) { status.textContent = 'Enter a room code to join.'; codeIn.focus(); return; }
    status.textContent = create ? 'Creating room…' : `Joining ${code}…`;
    busy(true);
    app.leaveNet();
    const net = new NetClient();
    try {
      await net.connect(code, name, create);
      app.net = net;
      app.show(lobbyScreen(app, net), () => { app.leaveNet(); app.online(); }, 'wide');
    } catch (e) {
      status.textContent = NET_ERROR_TEXT[e as NetError] ?? `Error: ${e}`;
      synth.menuBack();
    } finally { busy(false); }
  };
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(false); });

  const root = el('div', { class: 'panel-screen online' },
    el('div', { class: 'screen-head' }, btn('◀ Back', () => app.modes(), 'small ghost'), el('h1', {}, 'ONLINE'), el('span', { class: 'count-pill' }, `max ${MAX_PLAYERS} players`)),
    el('div', { class: 'online-grid' },
      el('label', { class: 'field' }, el('span', {}, 'Your name'), nameIn),
      btn('CREATE ROOM', () => connect(true), 'primary big', { 'data-autofocus': '' }),
      el('div', { class: 'or' }, '— or join a friend —'),
      el('div', { class: 'join-row' }, codeIn, btn('JOIN', () => connect(false), 'primary')),
      status,
      el('p', { class: 'muted small' }, 'The host simulates the match and streams state to everyone; inputs are buffered to smooth out network jitter. Share the room code with up to 9 friends.'),
    ),
  );
  return root;
}

function lobbyScreen(app: App, net: NetClient): HTMLElement {
  const root = el('div', { class: 'panel-screen lobby' });
  let lobby: LobbyState = { players: [], stageId: 'station', mode: 'stock', stocks: 3, timeSec: 180 };
  const listEl = el('div', { class: 'lobby-list' });
  const ctrlEl = el('div', { class: 'lobby-ctrl' });
  const pingEl = el('span', { class: 'count-pill' });
  let started = false;
  if (!isCharUnlocked(local.charId)) local.charId = 'nova';
  const pads = input.connectedPads();
  if (local.device === 'kb1' && pads.length) local.device = `pad${pads[0]}`;

  const me = () => lobby.players.find((p) => p.peerId === net.id);

  const hostBroadcast = () => { if (net.isHost) net.send('all', { k: 'lobby', lobby }); render(); };

  const hostSync = () => {
    // keep peer list in sync with relay (drop leavers, add joiners) while preserving CPUs
    const peers = net.peers;
    lobby.players = lobby.players.filter((p) => p.cpu || peers.some((q) => q.id === p.peerId));
    for (const q of peers) if (!lobby.players.some((p) => p.peerId === q.id && !p.cpu)) {
      if (lobby.players.length >= MAX_PLAYERS) { const cpuIdx = lobby.players.findIndex((p) => p.cpu); if (cpuIdx >= 0) lobby.players.splice(cpuIdx, 1); else continue; }
      lobby.players.push({ peerId: q.id, name: q.name, charId: q.id === net.id ? local.charId : 'nova' });
    }
    hostBroadcast();
  };

  net.onPeers = () => { if (net.isHost) hostSync(); else render(); };
  net.onError = (e) => { toast(NET_ERROR_TEXT[e] ?? String(e), 4000); app.endSession(); app.leaveNet(); app.online(); };
  net.onMsg = (from, d) => {
    if (net.isHost) {
      if (d?.k === 'pick') {
        const p = lobby.players.find((x) => x.peerId === from && !x.cpu);
        if (p && CHARACTERS.some((c) => c.id === d.charId)) { p.charId = d.charId; hostBroadcast(); }
      }
      return;
    }
    if (d?.k === 'lobby') { lobby = d.lobby; render(); }
    if (d?.k === 'start' && !started) {
      started = true;
      const myIndex = d.cfg.slots.findIndex((s: SlotConfig, i: number) => d.peerSlots[i] === net.id);
      const cfg = { ...d.cfg, slots: d.cfg.slots.map((s: SlotConfig, i: number) => ({ ...s, type: i === myIndex ? 'HUMAN' : s.type === 'CPU' ? 'CPU' : 'REMOTE', device: local.device })) };
      app.startMatch('client', cfg, () => backToLobby(), net, myIndex);
    }
  };

  const backToLobby = () => {
    started = false;
    app.show(root, () => { app.leaveNet(); app.online(); }, 'wide');
    reattach();
    render();
  };
  const reattach = () => {
    // Session replaced net.onMsg during the match; restore lobby handlers.
    net.onPeers = () => { if (net.isHost) hostSync(); else render(); };
    const handler = lobbyHandler;
    net.onMsg = handler;
    if (net.isHost) hostSync();
  };
  const lobbyHandler = net.onMsg;

  const startMatch = () => {
    if (!net.isHost) return;
    if (lobby.players.length < 2) { toast('Need at least 2 players (add CPUs or invite friends)'); return; }
    if (lobby.players.length > MAX_PLAYERS) { toast(`Max ${MAX_PLAYERS} players`); return; }
    const slots: SlotConfig[] = lobby.players.map((p, i) => ({
      slot: i, type: p.cpu ? 'CPU' : p.peerId === net.id ? 'HUMAN' : 'REMOTE', charId: p.charId, cpuLevel: p.level ?? 5, team: -1,
      device: local.device, name: p.cpu ? undefined : p.name,
    }));
    const peerSlots: Record<number, number> = {};
    lobby.players.forEach((p, i) => { if (!p.cpu) peerSlots[i] = p.peerId; });
    const rules: MatchRules = { mode: lobby.mode, stocks: lobby.stocks, timeSec: lobby.mode === 'time' ? lobby.timeSec : 0, hp: 150, stageId: lobby.stageId };
    const seed = Math.floor(Math.random() * 1e6);
    const cfg = { rules, slots, seed, peerSlots };
    net.send('all', { k: 'start', cfg: { rules, slots, seed }, peerSlots });
    started = true;
    app.startMatch('host', cfg, () => backToLobby(), net, lobby.players.findIndex((p) => p.peerId === net.id));
  };

  const render = () => {
    if (started) return;
    pingEl.textContent = net.latency != null ? `${Math.round(net.latency)} ms` : '… ms';
    listEl.innerHTML = '';
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = lobby.players[i];
      const col = PLAYER_COLORS[i];
      if (!p) { listEl.append(el('div', { class: 'lobby-slot empty', style: `--pc:${col}` }, el('b', {}, playerLabel(i)), el('span', { class: 'muted' }, 'open'))); continue; }
      const isMe = p.peerId === net.id && !p.cpu;
      const hostTag = net.peers.find((q) => q.id === p.peerId)?.host && !p.cpu ? ' 👑' : '';
      listEl.append(el('div', { class: `lobby-slot ${isMe ? 'me' : ''}`, style: `--pc:${col}` },
        el('b', {}, playerLabel(i)),
        portraitCanvas(44, (c, s) => drawPortrait(c, charById(p.charId), s / 2, s * 0.04, s * 1.2)),
        el('div', {}, el('div', { class: 'pc' }, (p.cpu ? `CPU Lv${p.level}` : p.name) + hostTag + (isMe ? ' (you)' : '')), el('div', { class: 'muted' }, charById(p.charId).name)),
        net.isHost && p.cpu ? btn('✕', () => { lobby.players = lobby.players.filter((x) => x !== p); hostBroadcast(); }, 'small ghost') : null,
      ));
    }
    ctrlEl.innerHTML = '';
    const mine = me();
    mount(ctrlEl,
      el('div', { class: 'lobby-pick' },
        cycler('Fighter', CHARACTERS.map((c) => ({ v: c.id, label: isCharUnlocked(c.id) ? c.name : `🔒 ${c.name}`, disabled: !isCharUnlocked(c.id) })), mine?.charId ?? local.charId, (v) => {
          local.charId = v;
          if (net.isHost) { const m = me(); if (m) m.charId = v; hostBroadcast(); } else net.send('host', { k: 'pick', charId: v });
        }),
        cycler('Ctrl', DEVICE_IDS.map((d) => ({ v: d, label: deviceLabel(d) })), local.device, (v) => { local.device = v; }),
      ),
      net.isHost ? el('div', { class: 'lobby-host' },
        cycler('Mode', [{ v: 'stock', label: 'Stock' }, { v: 'time', label: 'Time' }, { v: 'stamina', label: 'Stamina' }], lobby.mode, (v) => { lobby.mode = v; hostBroadcast(); }),
        lobby.mode === 'time'
          ? cycler('Time', [60, 120, 180, 300].map((t) => ({ v: t, label: `${t / 60}:00` })), lobby.timeSec, (v) => { lobby.timeSec = v; hostBroadcast(); })
          : cycler('Stocks', [1, 2, 3, 4, 5].map((n) => ({ v: n, label: String(n) })), lobby.stocks, (v) => { lobby.stocks = v; hostBroadcast(); }),
        cycler('Stage', STAGES.map((s) => ({ v: s.id, label: s.name })), lobby.stageId, (v) => { lobby.stageId = v; hostBroadcast(); }),
        cycler('Input delay', [0, 1, 2, 3, 4, 6].map((n) => ({ v: n, label: `${n}f` })), save.settings.inputDelay, (v) => { save.settings.inputDelay = v; persist(); }),
        cycler('CPU Lvl', Array.from({ length: 9 }, (_, k) => ({ v: k + 1, label: String(k + 1) })), lobby.players.find((p) => p.cpu)?.level ?? 5, (v) => { lobby.players.forEach((p) => { if (p.cpu) p.level = v; }); hostBroadcast(); }),
        btn('+ Add CPU', () => {
          if (lobby.players.length >= MAX_PLAYERS) { toast(`Room is full (${MAX_PLAYERS} max)`); return; }
          lobby.players.push({ peerId: -1000 - lobby.players.length, name: 'CPU', charId: CHARACTERS[lobby.players.length % 4].id, cpu: true, level: lobby.players.find((p) => p.cpu)?.level ?? 5 });
          hostBroadcast();
        }, 'small'),
        btn('START MATCH ▶', startMatch, 'primary big', { 'data-autofocus': '' }),
      ) : el('div', { class: 'lobby-host' }, el('div', { class: 'stage-mini' }, stagePreview(STAGES.find((s) => s.id === lobby.stageId) ?? STAGES[0], 160, 80)),
        el('div', { class: 'muted' }, `${lobby.mode.toUpperCase()} · ${lobby.mode === 'time' ? `${lobby.timeSec / 60} min` : `${lobby.stocks} stocks`}`),
        el('div', { class: 'waiting blink' }, 'Waiting for host to start…')),
    );
  };

  const off = app.onStep(() => { if (!root.isConnected) return; if (Math.random() < 0.02) pingEl.textContent = net.latency != null ? `${Math.round(net.latency)} ms` : '… ms'; });
  void off;

  root.append(
    el('div', { class: 'screen-head' }, btn('◀ Leave', () => { app.leaveNet(); app.online(); }, 'small ghost'),
      el('h1', {}, 'ROOM ', el('span', { class: 'room-code' }, net.room)),
      el('span', { class: 'count-pill' }, '📶 ', pingEl)),
    el('div', { class: 'lobby-layout' }, listEl, ctrlEl),
    el('p', { class: 'muted small' }, `Share code ${net.room} — up to ${MAX_PLAYERS} players per room. The host's settings apply to everyone.`),
  );
  if (net.isHost) hostSync(); else render();
  return root;
}
