import { synth } from '../audio/synth';
import { el, btn, toast } from './dom';
import { currentUser, login, register, logout, syncNow, lastSync } from '../net/account';
import { save } from '../core/save';
import { totalStars, STORY } from '../story/campaign';
import { CHARACTERS } from '../sim/characters';
import type { App } from './app';

/** Log in / create account / account details. */
export function accountScreen(app: App, back: () => void): HTMLElement {
  const user = currentUser();
  const root = el('div', { class: 'panel-screen account' });
  const head = el('div', { class: 'screen-head' }, btn('◀ Back', back, 'small ghost'), el('h1', {}, 'ACCOUNT'), el('span', {}));
  if (user) {
    const unlockedCount = CHARACTERS.filter((c) => c.starter || save.unlocked.includes(c.id)).length;
    const status = el('div', { class: 'muted small' }, lastSync ? (lastSync.ok ? `☁ Cloud save synced ${new Date(lastSync.at).toLocaleTimeString()}` : `⚠ Sync failed: ${lastSync.msg}`) : '☁ Cloud save on');
    root.append(head, el('div', { class: 'acct-card' },
      el('div', { class: 'acct-avatar' }, user.slice(0, 1).toUpperCase()),
      el('div', {}, el('div', { class: 'muted small' }, 'Signed in as'), el('h2', {}, user), status),
    ), el('div', { class: 'acct-stats' },
      el('div', {}, el('b', {}, `${unlockedCount}/${CHARACTERS.length}`), el('span', {}, 'fighters')),
      el('div', {}, el('b', {}, `${totalStars()}/${STORY.length * 3}`), el('span', {}, 'story stars')),
      el('div', {}, el('b', {}, String(save.matches ?? 0)), el('span', {}, 'matches')),
    ), el('p', { class: 'muted small' }, 'Your progress, unlocks, controls and settings are saved to your account automatically, so you can continue on any device. Your username is also your name in online rooms.'),
    el('div', { class: 'row-actions' },
      btn('Sync now', async () => { await syncNow(); app.account(back); }, ''),
      btn('Log out', async () => { await logout(); toast('Logged out'); app.account(back); }, 'danger')));
    return root;
  }
  let mode: 'login' | 'register' = 'login';
  const form = el('form', { class: 'acct-form' });
  const draw = () => {
    form.innerHTML = '';
    const u = el('input', { type: 'text', autocomplete: 'username', maxlength: '16', placeholder: 'Username', 'data-nav': '', 'data-autofocus': '', class: 'text-in' }) as HTMLInputElement;
    const p = el('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', maxlength: '128', placeholder: 'Password', 'data-nav': '', class: 'text-in' }) as HTMLInputElement;
    const p2 = el('input', { type: 'password', autocomplete: 'new-password', maxlength: '128', placeholder: 'Confirm password', 'data-nav': '', class: 'text-in' }) as HTMLInputElement;
    const err = el('div', { class: 'net-status' });
    const submit = el('button', { type: 'submit', class: 'btn primary big', 'data-nav': '' }, mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT');
    form.append(
      el('div', { class: 'tabs' },
        btn('Log in', () => { mode = 'login'; draw(); }, `tab ${mode === 'login' ? 'sel' : ''}`, { type: 'button' }),
        btn('Create account', () => { mode = 'register'; draw(); }, `tab ${mode === 'register' ? 'sel' : ''}`, { type: 'button' })),
      el('label', { class: 'field' }, el('span', {}, 'Username'), u),
      el('label', { class: 'field' }, el('span', {}, 'Password'), p),
      ...(mode === 'register' ? [el('label', { class: 'field' }, el('span', {}, 'Confirm password'), p2), el('p', { class: 'muted small' }, 'Username: 3–16 letters, numbers or _. Password: at least 6 characters.')] : []),
      err, submit,
      el('p', { class: 'muted small' }, 'Accounts are optional — you can keep playing as a guest. Logging in saves your progress to the cloud.'));
    form.onsubmit = async (e) => {
      e.preventDefault(); synth.unlock();
      err.textContent = '';
      if (mode === 'register' && p.value !== p2.value) { err.textContent = 'Passwords do not match'; return; }
      form.classList.add('busy');
      try {
        if (mode === 'login') await login(u.value.trim(), p.value); else await register(u.value.trim(), p.value);
        synth.menuSelect(); toast(`Welcome, ${currentUser()}!`); app.account(back);
      } catch (x) { err.textContent = (x as Error).message; synth.menuBack(); }
      finally { form.classList.remove('busy'); }
    };
    requestAnimationFrame(() => u.focus());
  };
  draw();
  root.append(head, form);
  return root;
}
