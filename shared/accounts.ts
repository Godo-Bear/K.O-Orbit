/**
 * Account service shared by the Cloudflare Worker (Durable Object storage) and the Vite dev server
 * (JSON file). Username + password accounts, PBKDF2-SHA256 password hashing, bearer-token sessions,
 * failed-login lockout, and a per-user cloud save blob.
 */
export interface KV {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean | void>;
}

interface UserRec { name: string; salt: string; hash: string; created: number }
interface Session { u: string; exp: number }
interface Fail { n: number; until: number }

const ITER = 100_000; // Workers' PBKDF2 maximum
const SESSION_DAYS = 30;
const MAX_SAVE = 64 * 1024;
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));
const randHex = (n: number) => toHex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPassword(pw: string, saltHex: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITER }, key, 256);
  return toHex(bits);
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const USER_RE = /^[A-Za-z0-9_]{3,16}$/;

async function readJson(req: Request): Promise<any> {
  const t = await req.text();
  if (t.length > MAX_SAVE + 1024) throw new Error('too-large');
  try { return JSON.parse(t || '{}'); } catch { return {}; }
}

async function auth(req: Request, kv: KV): Promise<{ key: string; token: string } | null> {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const s = await kv.get<Session>(`session:${token}`);
  if (!s || s.exp < Date.now()) { if (s) await kv.delete(`session:${token}`); return null; }
  return { key: s.u, token };
}

async function newSession(kv: KV, userKey: string) {
  const token = randHex(32);
  await kv.put(`session:${token}`, { u: userKey, exp: Date.now() + SESSION_DAYS * 86400_000 } satisfies Session);
  return token;
}

export async function handleAccounts(req: Request, kv: KV): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  try {
    if (path === '/api/register' && req.method === 'POST') {
      const { username, password } = await readJson(req);
      if (typeof username !== 'string' || !USER_RE.test(username)) return json(400, { error: 'Username must be 3–16 letters, numbers or _' });
      if (typeof password !== 'string' || password.length < 6 || password.length > 128) return json(400, { error: 'Password must be at least 6 characters' });
      const key = username.toLowerCase();
      if (await kv.get(`user:${key}`)) return json(409, { error: 'That username is taken' });
      const salt = randHex(16);
      await kv.put(`user:${key}`, { name: username, salt, hash: await hashPassword(password, salt), created: Date.now() } satisfies UserRec);
      return json(200, { token: await newSession(kv, key), username, save: null });
    }
    if (path === '/api/login' && req.method === 'POST') {
      const { username, password } = await readJson(req);
      if (typeof username !== 'string' || typeof password !== 'string') return json(400, { error: 'Enter a username and password' });
      const key = username.toLowerCase();
      const fail = await kv.get<Fail>(`fail:${key}`);
      if (fail && fail.until > Date.now()) return json(429, { error: `Too many attempts — try again in ${Math.ceil((fail.until - Date.now()) / 1000)}s` });
      const u = await kv.get<UserRec>(`user:${key}`);
      const ok = !!u && safeEqual(await hashPassword(password, u.salt), u.hash);
      if (!ok) {
        const n = (fail?.n ?? 0) + 1;
        await kv.put(`fail:${key}`, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 60_000 : 0 } satisfies Fail);
        return json(401, { error: 'Wrong username or password' });
      }
      await kv.delete(`fail:${key}`);
      return json(200, { token: await newSession(kv, key), username: u!.name, save: (await kv.get(`save:${key}`)) ?? null });
    }
    const a = await auth(req, kv);
    if (!a) return json(401, { error: 'Not logged in' });
    if (path === '/api/logout' && req.method === 'POST') { await kv.delete(`session:${a.token}`); return json(200, { ok: true }); }
    if (path === '/api/me' && req.method === 'GET') {
      const u = await kv.get<UserRec>(`user:${a.key}`);
      if (!u) return json(401, { error: 'Not logged in' });
      return json(200, { username: u.name, save: (await kv.get(`save:${a.key}`)) ?? null });
    }
    if (path === '/api/save' && req.method === 'PUT') {
      const { save } = await readJson(req);
      if (!save || typeof save !== 'object') return json(400, { error: 'Missing save' });
      if (JSON.stringify(save).length > MAX_SAVE) return json(413, { error: 'Save too large' });
      await kv.put(`save:${a.key}`, { ...save, savedAt: Date.now() });
      return json(200, { ok: true, savedAt: Date.now() });
    }
    return json(404, { error: 'Not found' });
  } catch (e) {
    if ((e as Error).message === 'too-large') return json(413, { error: 'Request too large' });
    return json(500, { error: 'Server error' });
  }
}
