import { save, persist, persistHooks, type SaveData } from '../core/save';

/** Client for the account API: login state, and automatic cloud save sync while logged in. */
const AUTH_KEY = 'ko-orbit-auth';
interface AuthState { token: string; username: string }

let auth: AuthState | null = (() => { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch { return null; } })();
let syncTimer = 0;
let applying = false;
export let lastSync: { at: number; ok: boolean; msg?: string } | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
export const onAccountChange = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };

export const currentUser = () => auth?.username ?? null;

async function api(path: string, method: string, body?: unknown) {
  const r = await fetch(`${import.meta.env.BASE_URL}api/${path}`, {
    method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = {};
  try { data = await r.json(); } catch { /* non-JSON (e.g. static host without the API) */ }
  if (!r.ok) throw new Error(data.error ?? (r.status === 404 || r.status === 405 ? 'Accounts need the K.O Orbit server (Cloudflare Worker).' : `Server error (${r.status})`));
  return data;
}

function setAuth(a: AuthState | null) {
  auth = a;
  try { if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
  notify();
}

/** The part of the save that syncs to the cloud. */
function cloudPart() { return { story: save.story, unlocked: save.unlocked, matches: save.matches ?? 0, kb: save.kb, pad: save.pad, settings: save.settings }; }

/** Merge a cloud save into the local one: progress is combined (never lost), preferences come from the cloud. */
function mergeCloud(remote: Partial<SaveData> | null) {
  if (!remote) return;
  applying = true;
  for (const [id, stars] of Object.entries(remote.story?.cleared ?? {})) save.story.cleared[id] = Math.max(save.story.cleared[id] ?? 0, stars as number);
  save.unlocked = [...new Set([...save.unlocked, ...(remote.unlocked ?? [])])];
  save.matches = Math.max(save.matches ?? 0, remote.matches ?? 0);
  if (remote.kb) save.kb = remote.kb;
  if (remote.pad) save.pad = remote.pad;
  if (remote.settings) save.settings = { ...save.settings, ...remote.settings };
  persist();
  applying = false;
}

export async function syncNow() {
  if (!auth) return;
  clearTimeout(syncTimer);
  try { await api('save', 'PUT', { save: cloudPart() }); lastSync = { at: Date.now(), ok: true }; }
  catch (e) { lastSync = { at: Date.now(), ok: false, msg: (e as Error).message }; if ((e as Error).message === 'Not logged in') setAuth(null); }
  notify();
}

persistHooks.push(() => {
  if (!auth || applying) return;
  clearTimeout(syncTimer);
  syncTimer = window.setTimeout(syncNow, 1500);
});

export async function register(username: string, password: string) {
  const d = await api('register', 'POST', { username, password });
  setAuth({ token: d.token, username: d.username });
  await syncNow(); // upload this device's progress as the new account's starting point
}

export async function login(username: string, password: string) {
  const d = await api('login', 'POST', { username, password });
  setAuth({ token: d.token, username: d.username });
  mergeCloud(d.save);
  await syncNow();
}

export async function logout() {
  try { await api('logout', 'POST'); } catch { /* token may already be invalid */ }
  setAuth(null);
}

/** On startup: validate the stored session and pull the latest cloud save. */
export async function restoreSession() {
  if (!auth) return;
  try { const d = await api('me', 'GET'); setAuth({ ...auth, username: d.username }); mergeCloud(d.save); lastSync = { at: Date.now(), ok: true }; notify(); }
  catch (e) { if ((e as Error).message === 'Not logged in') setAuth(null); }
}
