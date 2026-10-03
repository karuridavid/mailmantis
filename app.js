'use strict';
/* Mail Signal dashboard. Plain JS, no build step.
   State comes from the API (S); UI-only state lives in `ui`. Every view is a
   function returning HTML; clicks are handled by one delegated listener using
   data-act attributes. */

const $ = (s, r = document) => r.querySelector(s);
const root = $('#root');
let S = null;
const ui = {
  page: 'overview', sel: null, filter: 'all', authMode: 'login',
  edits: {},      // unsaved draft text, keyed by draft id
  forms: {},      // unsaved form fields, keyed by form name
  pendingRender: false, pollTimer: null, sidebarOpen: false
};

// ------------------------------------------------------------------ icons

const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  settings: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  reply: '<path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M6 3l14 9-14 9V3z"/>',
  google: '<path d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.5h3.3c1.9-1.8 3-4.4 3-7.4Z"/><path d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path d="M6.5 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9Z"/><path d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.5 10A5.9 5.9 0 0 1 12 5.9Z"/>'
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="13" width="4" height="8" rx="1.3" fill="currentColor"/><rect x="10" y="8" width="4" height="13" rx="1.3" fill="currentColor"/><rect x="17" y="3" width="4" height="18" rx="1.3" fill="#10b981"/></svg>';

// ------------------------------------------------------------------ helpers

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}
const plural = (n, word, many = word + 's') => n + ' ' + (n === 1 ? word : many);
const ms = t => t ? new Date(t).getTime() : 0;

function ago(t, long = false) {
  if (!t) return '';
  const m = Math.max(0, Math.floor((Date.now() - ms(t)) / 60000));
  const out = m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : m < 10080 ? Math.floor(m / 1440) + 'd'
    : new Date(t).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  return long && out !== 'now' && !/[a-z]{3}/i.test(out) ? out + ' ago' : (long && out === 'now' ? 'just now' : out);
}
const fullDate = t => t ? new Date(t).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'}) : '';

function hue(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
const seedOf = email => S.seeds.find(s => s.email.toLowerCase() === String(email || '').toLowerCase());
const nameOf = email => { const s = seedOf(email); return (s && s.name) || String(email || '').split('@')[0]; };
const avatar = (email, cls = '') => `<span class="avatar ${cls}" style="--h:${hue(email)}">${esc((nameOf(email) || '?').charAt(0).toUpperCase())}</span>`;

const domainEmails = () => S.drafts.filter(d => d.kind === 'domain');
const sentEmails = () => domainEmails().filter(d => d.status === 'sent');
const repliesOf = id => S.drafts.filter(d => d.parent_id === id).sort((a, b) => ms(a.created_at) - ms(b.created_at));
const waiting = d => d.kind === 'domain' && d.status === 'sent' && (!d.placement || d.placement === 'Not found');
const editable = d => d.status === 'draft' || d.status === 'ready';

// Status model: k is the colour key (draft ready sent inbox tab spam).
function st(d) {
  if (d.status === 'draft') return {k: 'draft', label: 'Draft'};
  if (d.status === 'ready') return {k: 'ready', label: 'Ready to send'};
  if (d.kind === 'reply') return {k: 'sent', label: 'Reply sent'};
  if (d.placement === 'Inbox') {
    if (d.inbox_tab && d.inbox_tab !== 'Primary') return {k: 'tab', label: 'Inbox · ' + d.inbox_tab, short: d.inbox_tab};
    return {k: 'inbox', label: d.inbox_tab ? 'Inbox · Primary' : 'Inbox', short: 'Primary'};
  }
  if (d.placement === 'Spam') return {k: 'spam', label: 'Spam'};
  if (d.placement === 'Other folder') return {k: 'tab', label: 'Other folder'};
  if (d.placement === 'Not found') return {k: 'sent', label: 'Not found yet'};
  return {k: 'sent', label: Date.now() - ms(d.sent_at) < 20 * 60000 ? 'Checking…' : 'Not checked'};
}
const pill = d => { const s = st(d); return `<span class="pill s-${s.k}">${esc(s.label)}</span>`; };
const formVal = (form, name, fallback = '') => (ui.forms[form] && name in ui.forms[form]) ? ui.forms[form][name] : fallback;
const editVal = (d, field) => (ui.edits[d.id] && field in ui.edits[d.id]) ? ui.edits[d.id][field] : (d[field] || '');
const isDirty = d => !!ui.edits[d.id] && ['subject', 'body'].some(f => f in ui.edits[d.id] && ui.edits[d.id][f] !== (d[f] || ''));

function geminiBlocker() {
  if (!S.sender) return 'Connect the domain sender first';
  if (!S.website_summary) return 'Save a business brief first';
  if (S.ai_provider !== 'gemini' || !S.has_ai_key) return 'Add a Gemini API key in Settings';
  return '';
}

// ------------------------------------------------------------------ API

async function api(action, data = {}) {
  const res = await fetch('/api/app', {
    method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, ...data})
  });
  let out = {};
  try { out = await res.json(); } catch (e) { /* not JSON */ }
  if (res.status === 401 && !['login', 'setup_admin', 'status'].includes(action)) { S = null; ui.authMode = 'login'; renderAuth(); }
  if (!res.ok) throw new Error(out.error || 'Request failed (' + res.status + ')');
  return out;
}

async function load(force = true) {
  try {
    const d = await api('get_config');
    S = d;
    if (ui.sel && !S.drafts.some(x => x.id === ui.sel)) ui.sel = null;
    render(force);
    return true;
  } catch (e) {
    if (S) toast(e.message, 'err');
    return false;
  }
}

// ------------------------------------------------------------------ toasts & dialogs

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.innerHTML = icon(type === 'err' ? 'alert' : 'check') + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 6000 : 3500);
}

const dialog = $('#dialog');
function openDialog(html, onOpen) {
  dialog.innerHTML = html;
  dialog.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => closeDialog('cancel'); });
  dialog.showModal();
  if (onOpen) onOpen(dialog);
  return new Promise(resolve => {
    dialog.onclose = () => resolve(dialog.returnValue);
  });
}
function closeDialog(value = '') { dialog.close(value); }

async function confirmBox({title, text = '', ok = 'Confirm', danger = false}) {
  const result = await openDialog(`<form method="dialog">
    <div class="dlg-head"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}</div>
    <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" value="ok" autofocus>${esc(ok)}</button></div></form>`);
  return result === 'ok';
}

async function promptBox({title, text = '', label, value = '', ok = 'Save', placeholder = ''}) {
  const result = await openDialog(`<form method="dialog">
    <div class="dlg-head"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}</div>
    <div class="dlg-body"><div class="field"><label class="label" for="dlg-input">${esc(label)}</label><input class="input" id="dlg-input" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="100"></div></div>
    <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" value="ok">${esc(ok)}</button></div></form>`,
    d => { const i = $('#dlg-input', d); i.focus(); i.select(); });
  return result === 'ok' ? $('#dlg-input', dialog).value : null;
}

// ------------------------------------------------------------------ routing & rendering

const PAGES = {overview: 'Overview', emails: 'Emails', seeds: 'Seed inboxes', sender: 'Domain sender', log: 'Placement log', settings: 'Settings'};

function route() {
  const [, page, id] = (location.hash || '#/overview').split('/');
  ui.page = PAGES[page] ? page : 'overview';
  ui.sel = ui.page === 'emails' && id ? decodeURIComponent(id) : null;
  ui.sidebarOpen = false;
  render(true);
}
window.addEventListener('hashchange', route);
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

function render(force = true) {
  if (!S) return;
  const active = document.activeElement;
  if (!force && active && root.contains(active) && active.matches('input, textarea, select')) { ui.pendingRender = true; return; }
  ui.pendingRender = false;
  const scroll = {list: $('.mail-list')?.scrollTop, detail: $('.detail')?.scrollTop, win: window.scrollY, key: ui.page + ui.sel};
  root.innerHTML = shell();
  if (scroll.key === ui.page + ui.sel) {
    if ($('.mail-list') && scroll.list) $('.mail-list').scrollTop = scroll.list;
    if ($('.detail') && scroll.detail) $('.detail').scrollTop = scroll.detail;
    window.scrollTo(0, scroll.win);
  }
  document.title = PAGES[ui.page] + ' · Mail Signal';
}
root.addEventListener('focusout', () => setTimeout(() => {
  if (ui.pendingRender && !(document.activeElement && root.contains(document.activeElement) && document.activeElement.matches('input, textarea, select'))) render(true);
}, 0));

function shell() {
  const ready = S.drafts.filter(d => d.status === 'ready').length;
  const navItem = (page, ico, label, badge = '') =>
    `<a class="nav-item ${ui.page === page ? 'on' : ''}" href="#/${page}">${icon(ico)}${label}${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  const sender = S.sender;
  const theme = document.documentElement.dataset.theme || 'system';
  return `<div class="shell">
    <aside class="sidebar ${ui.sidebarOpen ? 'open' : ''}">
      <div class="brand"><span class="logo">${LOGO}</span>Mail Signal</div>
      ${navItem('overview', 'overview', 'Overview')}
      ${navItem('emails', 'mail', 'Emails', ready || '')}
      ${navItem('seeds', 'users', 'Seed inboxes')}
      ${navItem('sender', 'at', 'Domain sender')}
      <div class="nav-label">More</div>
      ${navItem('log', 'activity', 'Placement log')}
      ${navItem('settings', 'settings', 'Settings')}
      <div class="sidebar-foot">
        <div class="sender-card">${sender
          ? `<b title="${esc(sender.email)}">${esc(sender.email)}</b><div class="row"><span class="dot s-${sender.verified_at ? 'inbox' : 'tab'}"></span>${sender.verified_at ? 'Connected' : 'Not tested'}</div>`
          : `<b>No sender yet</b><div class="row"><span class="dot s-draft"></span><a href="#/sender">Connect a domain</a></div>`}</div>
        <div class="user-row"><span title="${esc(S.user.email)}">${esc(S.user.email)}</span>
          <button class="btn ghost sm icon" data-act="theme" title="Theme: ${theme}" aria-label="Switch theme">${icon(theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor')}</button>
          <button class="btn ghost sm icon" data-act="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button></div>
      </div>
    </aside>
    <main class="main">${({overview, emails, seeds, sender: senderPage, log, settings})[ui.page]()}</main>
  </div>`;
}

function header(title, sub = '', actions = '') {
  return `<header class="page-header">
    <button class="btn ghost icon menu-btn" data-act="menu" aria-label="Open menu">${icon('menu')}</button>
    <h1>${esc(title)}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}
    <div class="actions">${actions}</div></header>`;
}
const btn = (act, label, {ico = '', cls = '', id = '', attrs = '', disabled = false, title = ''} = {}) =>
  `<button class="btn ${cls}" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ''}${disabled ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''} ${attrs}>${ico ? icon(ico) : ''}${label ? `<span>${label}</span>` : ''}</button>`;
const empty = (ico, title, text, action = '') => `<div class="empty">${icon(ico)}<b>${esc(title)}</b><p>${text}</p>${action}</div>`;

// ------------------------------------------------------------------ overview

function overview() {
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = sentEmails().filter(d => ms(d.sent_at) >= weekAgo);
  const checked = recent.filter(d => ['Inbox', 'Spam', 'Other folder'].includes(d.placement));
  const count = k => checked.filter(d => st(d).k === k).length;
  const inboxAll = checked.filter(d => d.placement === 'Inbox').length;
  const rate = checked.length ? Math.round(inboxAll / checked.length * 100) : null;
  const spam = count('spam');
  const replies = S.drafts.filter(d => d.kind === 'reply' && d.status === 'sent' && ms(d.sent_at) >= weekAgo).length;

  const steps = [
    ['Domain sender', 'Connect and test SMTP', !!(S.sender && S.sender.verified_at), '#/sender'],
    ['Business brief', 'Describe the business', !!S.website_summary, '#/sender'],
    ['Gemini key', 'For writing drafts', S.ai_provider === 'gemini' && S.has_ai_key, '#/settings'],
    ['Google sign-in', 'OAuth client for Gmail', !!S.google.ready, '#/settings'],
    ['Seed inbox', 'Connect a Gmail inbox', S.seeds.some(s => s.enabled), '#/seeds'],
    ['First email', 'Draft and send one', sentEmails().length > 0, '#/emails']
  ];
  const done = steps.filter(s => s[2]).length;
  const setup = done === steps.length ? '' : `<div class="card"><div class="card-head"><h2>Get set up</h2><span class="sub">${done} of ${steps.length} done</span></div>
    <div class="setup">${steps.map(([t, s, ok, href], i) => `<a class="step ${ok ? 'done' : ''}" href="${href}"><span class="n">${ok ? icon('check') : i + 1}</span><b>${t}</b><span>${s}</span></a>`).join('')}</div></div>`;

  let sentence = 'Nothing sent this week yet.';
  if (checked.length) sentence = `${inboxAll} of ${checked.length} checked emails reached the inbox this week` + (spam ? `, ${spam} landed in Spam.` : '.');
  else if (recent.length) sentence = `${plural(recent.length, 'email')} sent this week, waiting for placement results.`;

  const stats = `<div class="card stats">
    <div class="stat"><div class="stat-label">${icon('inbox')}Inbox rate</div><div class="stat-value">${rate === null ? '—' : rate + '<small>%</small>'}</div>
      <div class="meter">${checked.length ? ['inbox', 'tab', 'spam'].map(k => count(k) ? `<span class="s-${k}" style="flex:${count(k)}"></span>` : '').join('') : ''}</div>
      <div class="stat-sub">${checked.length ? `${count('inbox')} Primary · ${count('tab')} other tabs` : 'No results yet'}</div></div>
    <div class="stat"><div class="stat-label">${icon('send')}Sent</div><div class="stat-value">${recent.length}</div><div class="stat-sub">Last 7 days${recent.filter(waiting).length ? ` · ${recent.filter(waiting).length} waiting` : ''}</div></div>
    <div class="stat"><div class="stat-label">${icon('alert')}In Spam</div><div class="stat-value" style="${spam ? 'color:var(--spam)' : ''}">${spam}</div><div class="stat-sub">Last 7 days</div></div>
    <div class="stat"><div class="stat-label">${icon('reply')}Replies</div><div class="stat-value">${replies}</div><div class="stat-sub">From seed inboxes</div></div>
  </div>`;

  return header('Overview', S.sender ? esc(S.sender.domain) : '',
      btn('refresh', 'Refresh', {ico: 'refresh', cls: 'hide-sm'}) + btn('compose', 'New emails', {ico: 'sparkles', cls: 'primary'})) +
    `<div class="page"><div class="hello"><div><h2>${esc(S.sender ? S.sender.domain : 'Welcome to Mail Signal')}</h2><p>${esc(sentence)}</p></div></div>
    <div class="stack">${setup}${stats}
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Inbox signal</h2><span class="sub hide-sm">Latest sends per seed inbox</span><div class="right"><a class="btn ghost sm" href="#/seeds">Manage</a></div></div>
          <div class="card-body" style="padding:8px 0">${matrix()}</div>
          <div class="card-foot">${legend()}</div></div>
        <div class="card"><div class="card-head"><h2>Needs attention</h2></div>${attention()}</div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Daily placement</h2><span class="sub">Last 14 days</span></div>${dailyBars()}</div>
        <div class="card"><div class="card-head"><h2>Activity</h2></div>${feed()}</div>
      </div>
    </div></div>`;
}

function legend() {
  return `<div class="legend">${[['inbox', 'Primary'], ['tab', 'Other tab / folder'], ['spam', 'Spam'], ['sent', 'Waiting']].map(([k, l]) => `<span><i class="dot s-${k}"></i>${l}</span>`).join('')}</div>`;
}

function matrix() {
  if (!S.seeds.length) return empty('users', 'No seed inboxes yet', 'Connect Gmail inboxes you own to see where each email lands.', '<a class="btn sm" href="#/seeds">Connect an inbox</a>');
  return `<div class="matrix">${S.seeds.map(seed => {
    const sent = sentEmails().filter(d => d.seed_email === seed.email).sort((a, b) => ms(a.sent_at) - ms(b.sent_at)).slice(-14);
    const checked = sent.filter(d => ['Inbox', 'Spam', 'Other folder'].includes(d.placement));
    const rate = checked.length ? Math.round(checked.filter(d => d.placement === 'Inbox').length / checked.length * 100) + '%' : '—';
    const cells = sent.length ? sent.map(d => { const s = st(d);
      return `<a class="cell s-${s.k} ${s.k === 'sent' ? 'wait' : ''}" href="#/emails/${esc(d.id)}" title="${esc(d.subject + ' · ' + s.label + ' · ' + fullDate(d.sent_at))}"></a>`; }).join('')
      : '<span class="faint small">Nothing sent yet</span>';
    return `<div class="matrix-row ${seed.enabled ? '' : 'paused'}"><div class="matrix-who">${avatar(seed.email, 'sm')}<div><b>${esc(seed.name || seed.email.split('@')[0])}</b><span>${esc(seed.email)}</span></div></div>
      <div class="cells">${cells}</div><div class="matrix-rate" title="Inbox rate">${rate}</div></div>`;
  }).join('')}</div>`;
}

function attention() {
  const items = [];
  const ready = S.drafts.filter(d => d.status === 'ready');
  const drafts = S.drafts.filter(d => d.status === 'draft');
  const spam = sentEmails().filter(d => d.placement === 'Spam' && Date.now() - ms(d.sent_at) < 14 * 86400000);
  const stale = sentEmails().filter(d => waiting(d) && Date.now() - ms(d.sent_at) > 20 * 60000 && Date.now() - ms(d.sent_at) < 3 * 86400000);
  const unreplied = sentEmails().filter(d => ['Inbox', 'Other folder'].includes(d.placement) && !repliesOf(d.id).length && Date.now() - ms(d.sent_at) < 7 * 86400000);
  const noSend = S.seeds.filter(s => s.auth_type === 'google_oauth' && !s.gmail_send_enabled);
  const item = (k, ico, title, sub, action) => `<div class="todo-item"><span class="feed-icon s-${k}">${icon(ico)}</span><div>${title}<small>${sub}</small></div>${action}</div>`;
  if (ready.length) items.push(item('ready', 'send', plural(ready.length, 'email') + ' ready to send', 'Review and press Send.', `<a class="btn sm" href="#/emails" data-act="filter" data-v="ready">Open</a>`));
  spam.slice(0, 2).forEach(d => items.push(item('spam', 'alert', `“${esc(d.subject)}” landed in Spam`, 'At ' + esc(nameOf(d.seed_email)) + '. Open it, mark it Not spam, and reply.', `<a class="btn sm" href="#/emails/${esc(d.id)}">View</a>`)));
  if (drafts.length) items.push(item('draft', 'pencil', plural(drafts.length, 'draft') + ' to review', 'Edit, then mark ready.', `<a class="btn sm" href="#/emails" data-act="filter" data-v="draft">Review</a>`));
  if (unreplied.length) items.push(item('inbox', 'reply', plural(unreplied.length, 'delivered email') + ' without a reply', 'Replying from some seeds is a normal engagement signal.', `<a class="btn sm" href="#/emails/${esc(unreplied[0].id)}">Reply</a>`));
  if (stale.length) items.push(item('sent', 'clock', plural(stale.length, 'email') + ' not found yet', 'Delivery can be slow. Check again.', btn('refresh', 'Check', {cls: 'sm'})));
  if (noSend.length) items.push(item('tab', 'key', plural(noSend.length, 'inbox', 'inboxes') + ' can’t send replies', 'Allow sending once per inbox.', `<a class="btn sm" href="#/seeds">Fix</a>`));
  return items.length ? `<div class="todo">${items.slice(0, 5).join('')}</div>` : empty('check', 'All clear', 'Nothing needs your attention. Draft a new round when you’re ready.');
}

function dailyBars() {
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d); }
  const per = days.map(day => {
    const list = sentEmails().filter(d => new Date(d.sent_at).toDateString() === day.toDateString());
    return ['inbox', 'tab', 'spam', 'sent'].map(k => [k, list.filter(d => st(d).k === k).length]);
  });
  const max = Math.max(3, ...per.map(p => p.reduce((a, [, n]) => a + n, 0)));
  return `<div class="bars">${per.map((p, i) => {
    const total = p.reduce((a, [, n]) => a + n, 0);
    const title = days[i].toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'}) + ': ' + (total ? p.filter(([, n]) => n).map(([k, n]) => n + ' ' + ({inbox: 'Primary', tab: 'other tab', spam: 'Spam', sent: 'waiting'})[k]).join(', ') : 'none');
    return `<div class="bar ${total ? '' : 'zero'}" title="${esc(title)}">${p.filter(([, n]) => n).map(([k, n]) => `<span class="s-${k}" style="height:${n / max * 100}%"></span>`).join('')}</div>`;
  }).join('')}</div><div class="bar-axis">${days.map((d, i) => `<span>${i % 2 ? '' : d.getDate()}</span>`).join('')}</div>`;
}

function feed() {
  const ev = [];
  S.drafts.forEach(d => {
    if (d.status !== 'sent') return;
    if (d.kind === 'reply') ev.push([d.sent_at, 'sent', 'reply', `<b>${esc(nameOf(d.from_email))}</b> replied`, d.subject, d.parent_id]);
    else {
      ev.push([d.sent_at, 'sent', 'send', `Sent to <b>${esc(nameOf(d.to_email))}</b>`, d.subject, d.id]);
      if (d.checked_at && d.placement && d.placement !== 'Not found') {
        const s = st(d);
        ev.push([d.checked_at, s.k, s.k === 'spam' ? 'alert' : 'inbox', `Landed in <b>${esc(s.label)}</b> for ${esc(nameOf(d.to_email))}`, d.subject, d.id]);
      }
    }
  });
  ev.sort((a, b) => ms(b[0]) - ms(a[0]));
  if (!ev.length) return empty('activity', 'No activity yet', 'Sends, placement results and replies will appear here.');
  return `<div class="feed">${ev.slice(0, 7).map(([t, k, ico, text, subject, id]) =>
    `<a class="feed-item" href="#/emails/${esc(id)}"><span class="feed-icon s-${k}">${icon(ico)}</span><span class="feed-text">${text}<span class="subject">${esc(subject)}</span></span><span class="feed-time" title="${esc(fullDate(t))}">${ago(t)}</span></a>`).join('')}</div>`;
}

// ------------------------------------------------------------------ emails

const FILTERS = [
  ['all', 'All', () => true], ['draft', 'Drafts', d => d.status === 'draft'], ['ready', 'Ready', d => d.status === 'ready'],
  ['sent', 'Sent', d => d.status === 'sent'], ['inbox', 'Inbox', d => d.status === 'sent' && d.placement === 'Inbox'],
  ['spam', 'Spam', d => d.status === 'sent' && d.placement === 'Spam']
];

function topLevel() {
  const ids = new Set(S.drafts.map(d => d.id));
  return S.drafts.filter(d => d.kind === 'domain' || !ids.has(d.parent_id));
}

function listOrder() {
  const order = {ready: 0, draft: 1, sent: 2};
  const fn = FILTERS.find(f => f[0] === ui.filter)[2];
  return topLevel().filter(fn).sort((a, b) => (order[a.status] - order[b.status]) || (ms(b.sent_at || b.updated_at) - ms(a.sent_at || a.updated_at)));
}

function emails() {
  const top = topLevel();
  const list = listOrder();
  const d = ui.sel && S.drafts.find(x => x.id === ui.sel);
  const seg = `<div class="seg" role="tablist">${FILTERS.map(([k, label, fn]) =>
    `<button class="${ui.filter === k ? 'on' : ''}" data-act="filter" data-v="${k}" role="tab">${label}<span class="count">${top.filter(fn).length}</span></button>`).join('')}</div>`;
  const rows = list.length ? list.map(row).join('')
    : empty('inbox', S.drafts.length ? 'Nothing here' : 'No emails yet', S.drafts.length ? 'No emails match this filter.' : 'Gemini writes one ordinary email per seed inbox from your business brief.',
        S.drafts.length ? '' : btn('compose', 'New emails', {ico: 'sparkles', cls: 'primary sm'}));
  return header('Emails', sentEmails().length + ' sent',
      btn('refresh', 'Refresh placement', {ico: 'refresh', cls: 'hide-sm'}) + btn('compose', 'New emails', {ico: 'sparkles', cls: 'primary'})) +
    `<div class="page flush"><div class="mail-toolbar">${seg}</div>
      <div class="split ${d ? 'has-detail' : ''}"><div class="mail-list" role="list">${rows}</div>
      <section class="detail">${d ? detail(d) : `<div class="detail-inner">${empty('mail', 'Select an email', 'Pick an email from the list to edit, send, check placement or reply. <br><kbd>J</kbd> <kbd>K</kbd> to move, <kbd>N</kbd> for new emails.')}</div>`}</section></div></div>`;
}

function row(d) {
  const reps = repliesOf(d.id);
  const who = d.kind === 'reply' ? nameOf(d.from_email) + ' (reply)' : nameOf(d.to_email);
  return `<a class="mail-row ${ui.sel === d.id ? 'on' : ''}" href="#/emails/${esc(d.id)}" role="listitem">${avatar(d.seed_email)}
    <div style="min-width:0"><div class="top"><span class="who">${esc(who)}</span><span class="when" title="${esc(fullDate(d.sent_at || d.updated_at))}">${ago(d.sent_at || d.updated_at)}</span></div>
    <div class="subj">${esc(editVal(d, 'subject') || '(no subject)')}</div>
    <div class="meta">${pill(d)}${reps.length ? `<span>${icon('reply')} ${reps.length}</span>` : ''}${isDirty(d) ? '<span style="color:var(--tab)">Unsaved</span>' : ''}</div></div></a>`;
}

function composerBar(d) {
  const blocker = geminiBlocker();
  const dirty = isDirty(d);
  const seed = seedOf(d.seed_email);
  const replyBlocked = d.kind === 'reply' && seed && seed.auth_type === 'google_oauth' && !seed.gmail_send_enabled;
  return `<div class="composer">
    <div class="ai" title="${esc(blocker)}">${icon('sparkles')}<input data-edit="guidance" data-id="${esc(d.id)}" value="${esc(editVal(d, 'guidance'))}" placeholder="${d.kind === 'reply' ? 'Tell Gemini what to say (optional)' : 'Instructions for Gemini (optional)'}" ${blocker ? 'disabled' : ''}>
      ${btn('gemini', d.body ? 'Rewrite' : 'Write', {cls: 'sm', id: d.id, disabled: !!blocker})}</div>
    <span class="dirty ${dirty ? '' : 'hidden'}" data-dirty="${esc(d.id)}">Unsaved</span>
    ${btn('save', 'Save', {id: d.id, disabled: !dirty})}
    ${d.status === 'draft' ? btn('ready', 'Mark ready', {cls: 'primary', id: d.id, ico: 'check'})
      : btn('unready', 'Back to draft', {id: d.id}) + btn('send', 'Send', {cls: 'primary', id: d.id, ico: 'send', disabled: replyBlocked, title: replyBlocked ? 'Allow sending replies for this inbox first' : ''})}
  </div>`;
}

function detail(d) {
  const back = `<a class="btn ghost sm back-btn" href="#/emails">${icon('left')}All emails</a>`;
  const isReply = d.kind === 'reply';
  const head = `<div class="detail-head"><div class="grow">${pill(d)}</div>
    ${d.kind === 'domain' && d.status === 'sent' ? btn('check', 'Check placement', {ico: 'refresh', cls: 'sm', id: d.id}) : ''}
    ${editable(d) ? btn('del', '', {ico: 'trash', cls: 'sm icon ghost', id: d.id, title: 'Delete draft'}) : ''}</div>`;
  const subject = editable(d)
    ? `<input class="subject-input" data-edit="subject" data-id="${esc(d.id)}" value="${esc(editVal(d, 'subject'))}" placeholder="Subject" maxlength="200" aria-label="Subject">`
    : `<h2 class="subject">${esc(d.subject)}</h2>`;
  const addr = `<div class="addr">${avatar(d.seed_email, 'sm')}${isReply
    ? `From <b>${esc(nameOf(d.from_email))}</b> ${esc(d.from_email)} → ${esc(d.to_email)}`
    : `To <b>${esc(nameOf(d.to_email))}</b> ${esc(d.to_email)} <span class="faint">· from ${esc(d.from_email)}</span>`}</div>`;
  const body = editable(d)
    ? `<div class="paper"><textarea class="body-input" data-edit="body" data-id="${esc(d.id)}" placeholder="Write the message, or ask Gemini below." maxlength="5000">${esc(editVal(d, 'body'))}</textarea></div>${composerBar(d)}`
    : `<div class="paper"><pre class="body-text">${esc(d.body)}</pre></div>`;
  let extra = '';
  if (d.kind === 'domain' && d.status === 'sent') extra = placementCard(d) + timeline(d) + repliesSection(d);
  if (isReply && editable(d)) {
    const seed = seedOf(d.seed_email);
    if (seed && seed.auth_type === 'google_oauth' && !seed.gmail_send_enabled)
      extra = `<div class="callout warn" style="margin-top:16px">${icon('key')}<div>This inbox can’t send replies yet. ${btn('allow', 'Allow sending replies', {cls: 'sm', id: seed.id})}</div></div>`;
  }
  return `<div class="detail-inner">${back}${head}<div style="margin-top:12px">${subject}</div>${addr}${body}${extra}</div>`;
}

function placementCard(d) {
  const s = st(d);
  const icons = {inbox: 'inbox', tab: 'folder', spam: 'alert', sent: 'clock'};
  const title = s.k === 'sent' ? (d.placement === 'Not found' ? 'Not found yet' : 'Waiting for the first check') : s.label;
  const why = {
    inbox: 'Gmail delivered this to the Primary inbox.',
    tab: d.placement === 'Other folder' ? 'Found outside Inbox and Spam (archived or labelled).' : 'Delivered to the inbox, but Gmail sorted it into the ' + d.inbox_tab + ' tab.',
    spam: 'Gmail put this in Spam. Open the inbox, mark it “Not spam”, then reply. Also check SPF, DKIM and DMARC for your domain.',
    sent: d.placement === 'Not found' ? 'Gmail hasn’t shown this message yet. Delivery can take a few minutes.' : 'The dashboard checks automatically while it’s open.'
  }[s.k];
  const labels = d.gmail_labels ? `<div class="labels">${d.gmail_labels.split(',').filter(Boolean).map(l => `<span class="chip">${esc(l)}</span>`).join('')}</div>` : '';
  return `<div class="section-title">Placement</div>
    <div class="placement s-${s.k}"><span class="big">${icon(icons[s.k])}</span><div><h3>${esc(title)}</h3><p>${esc(why)}${d.checked_at ? ` <span class="faint">Checked ${ago(d.checked_at, true)}.</span>` : ''}</p>${labels}</div>
    ${btn('check', 'Check again', {ico: 'refresh', cls: 'sm', id: d.id})}</div>`;
}

function timeline(d) {
  const items = [[d.created_at, 'draft', 'Drafted']];
  if (d.sent_at) items.push([d.sent_at, 'sent', 'Sent from ' + d.from_email]);
  S.activity.filter(a => a.draft_id === d.id).slice().reverse().forEach(a => {
    const s = st({kind: 'domain', status: 'sent', placement: a.result, inbox_tab: a.tab, sent_at: d.sent_at});
    items.push([a.created_at, s.k, 'Checked: ' + (a.result === 'Not found' ? 'not found' : s.label)]);
  });
  repliesOf(d.id).filter(r => r.status === 'sent').forEach(r => items.push([r.sent_at, 'inbox', 'Reply sent from ' + nameOf(r.from_email)]));
  items.sort((a, b) => ms(a[0]) - ms(b[0]));
  return `<div class="section-title">Timeline</div><div class="timeline">${items.map(([t, k, text]) =>
    `<div class="tl s-${k}"><span>${esc(text)}</span><span class="when" title="${esc(fullDate(t))}">${esc(fullDate(t))}</span></div>`).join('')}</div>`;
}

function repliesSection(d) {
  const reps = repliesOf(d.id);
  const open = reps.some(r => editable(r));
  const seed = seedOf(d.seed_email);
  const list = reps.map(r => {
    const head = `<div class="reply-head">${avatar(r.seed_email, 'sm')}<span class="grow"><b>${esc(nameOf(r.from_email))}</b> → ${esc(r.to_email)}</span>${pill(r)}
      ${editable(r) ? btn('del', '', {ico: 'trash', cls: 'sm icon ghost', id: r.id, title: 'Delete reply'}) : `<span class="faint small mono">${ago(r.sent_at)}</span>`}</div>`;
    const body = editable(r)
      ? `<textarea class="body-input" data-edit="body" data-id="${esc(r.id)}" placeholder="Write a short, natural reply…" maxlength="5000">${esc(editVal(r, 'body'))}</textarea>${composerBar(r)}`
      : `<pre class="body-text">${esc(r.body)}</pre>`;
    return `<div class="reply" data-reply="${esc(r.id)}">${head}${body}</div>`;
  }).join('');
  const blocked = seed && seed.auth_type === 'google_oauth' && !seed.gmail_send_enabled;
  return `<div class="section-title">Replies <span class="count">${reps.length}</span></div>
    ${blocked ? `<div class="callout warn">${icon('key')}<div>${esc(nameOf(d.seed_email))} can’t send replies yet. ${btn('allow', 'Allow sending replies', {cls: 'sm', id: seed.id})}</div></div>` : ''}
    ${list}${open ? '' : `<div style="margin-top:12px">${btn('reply', reps.length ? 'Reply again' : 'Reply from ' + esc(nameOf(d.seed_email)), {ico: 'reply', id: d.id})}</div>`}`;
}

// ------------------------------------------------------------------ seeds

function filterState(v, label) {
  if (v === true) return `<span class="pill s-inbox">On</span>`;
  if (v === false) return `<span class="pill s-draft">Off</span>`;
  return `<span class="pill plain s-draft" title="Choose Check filters to read it from Gmail">Unknown</span>`;
}

function seeds() {
  const g = S.google;
  const cards = S.seeds.map(s => {
    const oauth = s.auth_type === 'google_oauth';
    const sent = sentEmails().filter(d => d.seed_email === s.email).sort((a, b) => ms(a.sent_at) - ms(b.sent_at));
    const last = sent.slice(-10);
    return `<div class="card seed-card ${s.enabled ? '' : 'paused'}">
      <div class="card-head">${avatar(s.email)}<div class="who"><b>${esc(s.name || s.email.split('@')[0])}</b><span>${esc(s.email)}</span></div>
        <span class="pill plain">${s.provider === 'workspace' ? 'Workspace' : 'Gmail'}</span></div>
      <div class="kv">
        ${oauth ? `<div class="kv-row"><span class="k">Send replies</span>${s.gmail_send_enabled ? '<span class="pill s-inbox">Allowed</span>' : btn('allow', 'Allow', {cls: 'sm', id: s.id})}</div>
        <div class="kv-row"><span class="k">Never send to Spam</span>${filterState(s.filter_never_spam)}${s.filter_never_spam !== true ? btn('filter-spam', 'Add', {cls: 'sm', id: s.id}) : ''}</div>
        <div class="kv-row"><span class="k">Mark important</span>${filterState(s.filter_important)}${s.filter_important !== true ? btn('filter-important', 'Add', {cls: 'sm', id: s.id}) : ''}</div>`
        : `<div class="kv-row"><span class="k">Connected with an App Password (legacy). Reconnect with Google to reply and manage filters.</span></div>`}
        <div class="kv-row"><span class="k">Recent placement</span><div class="cells">${last.length ? last.map(d => { const x = st(d); return `<a class="cell s-${x.k} ${x.k === 'sent' ? 'wait' : ''}" href="#/emails/${esc(d.id)}" title="${esc(d.subject + ' · ' + x.label)}"></a>`; }).join('') : '<span class="faint small">None yet</span>'}</div></div>
      </div>
      <div class="card-foot">${btn('rename', 'Rename', {cls: 'sm ghost', ico: 'pencil', id: s.id})}${btn('toggle-seed', s.enabled ? 'Pause' : 'Resume', {cls: 'sm ghost', ico: s.enabled ? 'pause' : 'play', id: s.id})}
        <div class="right">${btn('remove-seed', 'Remove', {cls: 'sm ghost danger', ico: 'trash', id: s.id})}</div></div>
    </div>`;
  }).join('');
  const checked = S.seeds.map(s => s.filters_checked_at).filter(Boolean).sort().pop();
  return header('Seed inboxes', plural(S.seeds.filter(s => s.enabled).length, 'active inbox', 'active inboxes'),
      btn('check-filters', 'Check filters', {ico: 'shield', cls: 'hide-sm', disabled: !S.sender || !S.seeds.some(s => s.auth_type === 'google_oauth')}) +
      btn('connect', 'Connect inbox', {ico: 'plus', cls: 'primary', disabled: !g.ready, title: g.ready ? '' : 'Add your Google OAuth client in Settings first'})) +
    `<div class="page"><div class="stack">
      ${g.ready ? '' : `<div class="callout warn">${icon('key')}<div>Google sign-in isn’t set up. Add your OAuth client under <a href="#/settings"><b>Settings</b></a> to connect Gmail inboxes.</div></div>`}
      <div class="callout">${icon('shield')}<div><b>About filters.</b> “Never send to Spam” and “Mark important” add a Gmail filter for ${S.sender ? esc(S.sender.email) : 'your sender'} in that inbox. They only affect mail that arrives afterwards, and they change placement results. Leave them off where you want Gmail’s natural decision.${checked ? ` <span class="faint">Filters last read ${ago(checked, true)}.</span>` : ''}</div></div>
      ${S.seeds.length ? `<div class="seed-grid">${cards}</div>` : `<div class="card">${empty('users', 'No seed inboxes', 'Connect Gmail or Google Workspace inboxes you own. They receive your domain’s emails and can reply from here.', g.ready ? btn('connect', 'Connect inbox', {ico: 'plus', cls: 'primary sm'}) : '')}</div>`}
    </div></div>`;
}

// ------------------------------------------------------------------ sender

function senderPage() {
  const s = S.sender || {};
  const v = (name, fallback) => esc(formVal('sender', name, fallback ?? ''));
  const status = S.sender ? (S.sender.verified_at ? `<span class="pill s-inbox">Tested ${ago(S.sender.verified_at, true)}</span>` : '<span class="pill s-tab">Not tested</span>') : '<span class="pill s-draft">Not connected</span>';
  const brief = formVal('brief', 'summary', S.website_summary || '');
  const sources = ui.pendingSources || S.website_sources || [];
  const aiBlock = !S.sender ? 'Save the sender first' : (S.ai_provider !== 'gemini' || !S.has_ai_key) ? 'Add a Gemini key in Settings' : '';
  return header('Domain sender', S.sender ? esc(S.sender.domain) : '') + `<div class="page narrow"><div class="stack">
    <div class="card"><div class="card-head"><h2>Connection</h2><span class="sub hide-sm">SMTP account that sends to your seed inboxes</span><div class="right">${status}</div></div>
      <div class="card-body">
        <div class="field-row"><div class="field"><label class="label" for="f-from-name">From name</label><input class="input" id="f-from-name" data-form="sender" name="from_name" value="${v('from_name', s.from_name)}" placeholder="Fernhill Pottery" maxlength="100"></div>
          <div class="field"><label class="label" for="f-email">Sender address</label><input class="input" id="f-email" type="email" data-form="sender" name="email" value="${v('email', s.email)}" placeholder="hello@example.com"></div></div>
        <div class="field-row" style="margin-top:14px"><div class="field"><label class="label" for="f-domain">Domain</label><input class="input" id="f-domain" data-form="sender" name="domain" value="${v('domain', s.domain)}" placeholder="example.com"></div>
          <div class="field"><label class="label" for="f-host">SMTP server</label><input class="input" id="f-host" data-form="sender" name="smtp_host" value="${v('smtp_host', s.smtp_host)}" placeholder="smtp-relay.brevo.com"></div></div>
        <div class="field-row" style="margin-top:14px"><div class="field"><label class="label" for="f-port">Port</label><select class="input" id="f-port" data-form="sender" name="smtp_port">${[587, 465].map(p => `<option value="${p}" ${String(formVal('sender', 'smtp_port', s.smtp_port || 587)) === String(p) ? 'selected' : ''}>${p} · ${p === 587 ? 'STARTTLS' : 'SSL'}</option>`).join('')}</select></div>
          <div class="field"><label class="label" for="f-user">SMTP login</label><input class="input" id="f-user" data-form="sender" name="smtp_username" value="${v('smtp_username', s.smtp_username)}" placeholder="Same as sender address"></div></div>
        <div class="field" style="margin-top:14px"><label class="label" for="f-pass">SMTP password or key</label><input class="input" id="f-pass" type="password" autocomplete="new-password" data-form="sender" name="password" value="${v('password')}" placeholder="${S.sender ? 'Saved. Leave blank to keep it' : ''}">
          <span class="hint">Brevo: <span class="mono">smtp-relay.brevo.com</span>, port 587, your SMTP login and SMTP key. Cloudflare Email Routing can’t send.</span></div>
      </div>
      <div class="card-foot"><span class="hint" id="sender-msg"></span><div class="right">${btn('test-sender', 'Test connection')}${btn('save-sender', 'Save sender', {cls: 'primary'})}</div></div></div>

    <div class="card"><div class="card-head"><h2>Business brief</h2><div class="right">${btn('read-site', 'Read website', {ico: 'sparkles', cls: 'sm', disabled: !!aiBlock, title: aiBlock})}</div></div>
      <div class="card-body"><p class="muted" style="margin:0 0 12px;font-size:13px">Gemini only uses facts from this brief when it writes. Read your website, correct anything wrong, then save, or write it yourself.</p>
        <textarea class="input" data-form="brief" name="summary" rows="8" maxlength="6000" placeholder="What the business does, who it serves, its main products or services, and its tone.">${esc(brief)}</textarea>
        <div class="labels" style="margin-top:10px">${sources.map(u => `<span class="chip">${icon('globe')}&nbsp;${esc(u.replace(/^https?:\/\//, ''))}</span>`).join('')}${S.website_summary_updated ? `<span class="faint small" style="align-self:center">Saved ${ago(S.website_summary_updated, true)}</span>` : ''}</div></div>
      <div class="card-foot"><span class="hint mono">${brief.length} / 6000</span><div class="right">${btn('save-brief', 'Save brief', {cls: 'primary'})}</div></div></div>
  </div></div>`;
}

// ------------------------------------------------------------------ log & settings

function log() {
  const subjects = Object.fromEntries(S.drafts.map(d => [d.id, d.subject]));
  const rows = S.activity.map(a => {
    const s = st({kind: 'domain', status: 'sent', placement: a.result, inbox_tab: a.tab});
    return `<tr><td class="mono small" title="${esc(fullDate(a.created_at))}">${esc(fullDate(a.created_at))}</td><td>${esc(nameOf(a.seed_email))}</td>
      <td><span class="pill s-${s.k}">${esc(a.result === 'Not found' ? 'Not found' : s.label)}</span></td>
      <td class="clip hide-xs">${a.draft_id && subjects[a.draft_id] ? `<a href="#/emails/${esc(a.draft_id)}">${esc(subjects[a.draft_id])}</a>` : '<span class="faint mono small">' + esc(a.message_id) + '</span>'}</td>
      <td class="mono small faint hide-xs">${a.duration_ms} ms</td></tr>`;
  }).join('');
  return header('Placement log', 'Read-only checks of Gmail labels', btn('refresh', 'Refresh placement', {ico: 'refresh'})) +
    `<div class="page"><div class="card">${S.activity.length ? `<table class="table"><thead><tr><th>Checked</th><th>Inbox</th><th>Result</th><th class="hide-xs">Email</th><th class="hide-xs">Took</th></tr></thead><tbody>${rows}</tbody></table>`
      : empty('activity', 'No checks yet', 'Every placement check is recorded here. Checks never move messages or change labels.')}</div></div>`;
}

function settings() {
  const theme = document.documentElement.dataset.theme || 'system';
  const g = S.google;
  const env = g.source === 'env';
  return header('Settings') + `<div class="page narrow"><div class="card"><div class="card-body" style="padding:24px">
    <section class="settings-section"><div><h3>Appearance</h3><p>Follows your system unless you choose.</p></div>
      <div><div class="seg">${[['system', 'monitor', 'System'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']].map(([k, i, l]) =>
        `<button class="${theme === k ? 'on' : ''}" data-act="set-theme" data-v="${k}">${icon(i)}${l}</button>`).join('')}</div></div></section>

    <section class="settings-section"><div><h3>Gemini</h3><p>Writes drafts and reads your website. It never sends anything.</p></div>
      <div><div class="field-row"><div class="field"><label class="label" for="s-ai">AI service</label><select class="input" id="s-ai" data-form="ai" name="provider">${[['none', 'Off'], ['gemini', 'Google Gemini']].map(([k, l]) => `<option value="${k}" ${formVal('ai', 'provider', S.ai_provider === 'gemini' ? 'gemini' : 'none') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="s-model">Model</label><input class="input mono" id="s-model" data-form="ai" name="model" value="${esc(formVal('ai', 'model', S.ai_model || ''))}" placeholder="${esc(S.default_model)}"></div></div>
        <div class="field" style="margin-top:14px"><label class="label" for="s-key">API key</label><input class="input" id="s-key" type="password" autocomplete="new-password" data-form="ai" name="key" value="${esc(formVal('ai', 'key'))}" placeholder="${S.has_ai_key ? 'Saved. Leave blank to keep it' : 'From aistudio.google.com'}"><span class="hint">Encrypted in the database and only sent from the server to Google.</span></div>
        <div style="margin-top:14px">${btn('save-ai', 'Save', {cls: 'primary'})}</div></div></section>

    <section class="settings-section"><div><h3>Google sign-in</h3><p>OAuth client used to connect seed inboxes. ${g.ready ? '<span class="pill s-inbox" style="margin-top:8px">Ready</span>' : '<span class="pill s-tab" style="margin-top:8px">Not set</span>'}</p></div>
      <div><div class="field"><span class="label">Authorized redirect URI</span><div class="copy"><code>${esc(g.redirect_uri)}</code>${btn('copy', '', {ico: 'copy', cls: 'sm icon ghost', attrs: `data-v="${esc(g.redirect_uri)}"`, title: 'Copy'})}</div>
        <span class="hint">Add this exact URI to your OAuth web client in Google Cloud, and enable the Gmail API.</span></div>
        ${env ? `<div class="callout" style="margin-top:14px">${icon('key')}<div>Set by environment variables on this server (client <span class="mono">${esc(g.client_id.slice(0, 12))}…</span>).</div></div>`
        : `<div class="field" style="margin-top:14px"><label class="label" for="s-gid">Client ID</label><input class="input mono" id="s-gid" data-form="google" name="client_id" value="${esc(formVal('google', 'client_id', g.client_id))}" placeholder="….apps.googleusercontent.com"></div>
        <div class="field"><label class="label" for="s-gsecret">Client secret</label><input class="input" id="s-gsecret" type="password" autocomplete="new-password" data-form="google" name="client_secret" value="${esc(formVal('google', 'client_secret'))}" placeholder="${g.ready ? 'Saved. Leave blank to keep it' : ''}"></div>
        <div style="margin-top:14px">${btn('save-google', 'Save', {cls: 'primary'})}</div>`}</div></section>

    <section class="settings-section"><div><h3>Password</h3><p>Signed in as ${esc(S.user.email)}. Changing it signs you out everywhere.</p></div>
      <div><div class="field-row"><div class="field"><label class="label" for="s-cur">Current password</label><input class="input" id="s-cur" type="password" autocomplete="current-password" data-form="pw" name="current"></div>
        <div class="field"><label class="label" for="s-new">New password</label><input class="input" id="s-new" type="password" autocomplete="new-password" data-form="pw" name="next" placeholder="12+ characters"></div></div>
        <div style="margin-top:14px">${btn('change-password', 'Update password')}</div></div></section>
  </div></div></div>`;
}

// ------------------------------------------------------------------ auth view

function renderAuth(message = '') {
  stopPolling();
  const setup = ui.authMode === 'setup';
  root.innerHTML = `<div class="auth"><div class="auth-card"><div class="logo">${LOGO}</div>
    <h1>${setup ? 'Create your admin login' : 'Sign in to Mail Signal'}</h1><p>${setup ? 'Use the one-time setup key from your server.' : 'Your private deliverability workspace.'}</p>
    <form id="auth-form">
      ${setup ? '<div class="field"><label class="label" for="a-key">Setup key</label><input class="input" id="a-key" type="password" required autocomplete="off"></div>' : ''}
      <div class="field"><label class="label" for="a-email">Email</label><input class="input" id="a-email" type="email" required autocomplete="username"></div>
      <div class="field"><label class="label" for="a-pass">Password</label><input class="input" id="a-pass" type="password" required ${setup ? 'minlength="12" autocomplete="new-password" placeholder="12+ characters"' : 'autocomplete="current-password"'}></div>
      <button class="btn primary">${setup ? 'Create login' : 'Sign in'}</button>
      <p class="form-error" id="auth-error">${esc(message)}</p>
    </form></div></div>`;
  $('#a-' + (setup ? 'key' : 'email')).focus();
  $('#auth-form').onsubmit = async e => {
    e.preventDefault();
    const button = $('#auth-form .btn');
    button.disabled = true;
    try {
      const d = setup
        ? await api('setup_admin', {setup_key: $('#a-key').value, email: $('#a-email').value, password: $('#a-pass').value})
        : await api('login', {email: $('#a-email').value, password: $('#a-pass').value});
      await start(d.user);
    } catch (err) {
      $('#auth-error').textContent = err.message;
      button.disabled = false;
    }
  };
}

// ------------------------------------------------------------------ placement polling

async function refreshPlacements(silent = false) {
  if (silent && !sentEmails().some(waiting)) { schedulePolling(); return; }
  try {
    const r = await api('check_placement');
    await load(!silent);
    if (!silent) toast(r.results.length ? plural(r.results.length, 'email') + ' checked' + (r.failures ? `, ${r.failures} failed` : '') : 'Nothing is waiting for a result');
  } catch (e) { if (!silent) toast(e.message, 'err'); }
  schedulePolling();
}
function schedulePolling() {
  stopPolling();
  if (sentEmails().some(d => waiting(d) && Date.now() - ms(d.sent_at) < 20 * 60000))
    ui.pollTimer = setTimeout(() => document.hidden ? schedulePolling() : refreshPlacements(true), 30000);
}
function stopPolling() { clearTimeout(ui.pollTimer); ui.pollTimer = null; }

// ------------------------------------------------------------------ actions

async function withBusy(el, fn) {
  if (!el || el.tagName !== 'BUTTON') return fn();
  const html = el.innerHTML;
  el.disabled = true;
  el.innerHTML = '<span class="spin"></span>' + (el.querySelector('span:not(.spin)') ? `<span>${el.textContent.trim()}</span>` : '');
  try { return await fn(); } finally { if (el.isConnected) { el.disabled = false; el.innerHTML = html; } }
}

async function saveEdits(id) {
  const d = S.drafts.find(x => x.id === id);
  if (!d || !isDirty(d)) return;
  await api('save_draft', {id, subject: editVal(d, 'subject'), body: editVal(d, 'body')});
  const g = ui.edits[id] && ui.edits[id].guidance;
  delete ui.edits[id];
  if (g) ui.edits[id] = {guidance: g};
}

function senderPayload() {
  const s = S.sender || {};
  const f = name => formVal('sender', name, name === 'smtp_port' ? (s.smtp_port || 587) : (s[name] || ''));
  return {from_name: f('from_name'), email: f('email'), domain: f('domain'), smtp_host: f('smtp_host'), smtp_port: Number(f('smtp_port')), smtp_username: f('smtp_username'), password: f('password')};
}

const ACTIONS = {
  menu() { ui.sidebarOpen = !ui.sidebarOpen; $('.sidebar').classList.toggle('open', ui.sidebarOpen); },
  async logout() { try { await api('logout'); } finally { S = null; ui.authMode = 'login'; renderAuth(); } },
  theme() { const order = ['system', 'light', 'dark']; ACTIONS['set-theme'](null, order[(order.indexOf(document.documentElement.dataset.theme || 'system') + 1) % 3]); },
  'set-theme'(el, v = el.dataset.v) {
    if (v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    try { localStorage.setItem('ms-theme', v); } catch (e) { /* storage blocked */ }
    render(true);
  },
  filter(el) { ui.filter = el.dataset.v; if (ui.page === 'emails') render(true); },
  async refresh(el) { await withBusy(el, () => refreshPlacements(false)); },
  async copy(el) { try { await navigator.clipboard.writeText(el.dataset.v); toast('Copied'); } catch (e) { toast('Copy failed. Select the text instead', 'err'); } },

  compose() { composeDialog(); },
  async save(el) { await withBusy(el, async () => { await saveEdits(el.dataset.id); await load(); toast('Saved. Not sent.'); }); },
  async ready(el) {
    await withBusy(el, async () => { await saveEdits(el.dataset.id); await api('set_draft_status', {id: el.dataset.id, status: 'ready'}); await load(); });
  },
  async unready(el) { await withBusy(el, async () => { await api('set_draft_status', {id: el.dataset.id, status: 'draft'}); await load(); }); },
  async del(el) {
    const d = S.drafts.find(x => x.id === el.dataset.id);
    if (!await confirmBox({title: d.kind === 'reply' ? 'Delete this reply?' : 'Delete this draft?', text: d.subject || '', ok: 'Delete', danger: true})) return;
    await api('delete_draft', {id: d.id});
    delete ui.edits[d.id];
    if (ui.sel === d.id) { ui.sel = null; history.replaceState(null, '', '#/emails'); }
    await load();
  },
  async send(el) {
    const d = S.drafts.find(x => x.id === el.dataset.id);
    const subject = editVal(d, 'subject');
    if (!await confirmBox({title: d.kind === 'reply' ? 'Send this reply?' : 'Send this email?', text: `From: ${d.from_email}\nTo: ${d.to_email}\nSubject: ${subject}`, ok: 'Send now'})) return;
    await withBusy(el, async () => {
      await saveEdits(d.id);
      const r = await api('send_draft', {id: d.id});
      toast(r.message);
      await load();
      if (d.kind === 'domain') { setTimeout(() => refreshPlacements(true), 15000); schedulePolling(); }
    });
  },
  async gemini(el) {
    const d = S.drafts.find(x => x.id === el.dataset.id);
    if ((editVal(d, 'body') || '').trim() && !await confirmBox({title: 'Replace this text?', text: 'Gemini will write a new version. Your current text will be replaced.', ok: 'Rewrite'})) return;
    await withBusy(el, async () => {
      await api('write_with_gemini', {id: d.id, guidance: editVal(d, 'guidance')});
      delete ui.edits[d.id];
      await load();
      toast('Gemini draft added. Review it before sending.');
    });
  },
  async check(el) {
    await withBusy(el, async () => {
      const r = (await api('check_placement', {id: el.dataset.id})).results[0];
      await load();
      toast('Gmail reports: ' + r.placement + (r.tab ? ' · ' + r.tab : ''));
    });
  },
  async reply(el) {
    await withBusy(el, async () => {
      const r = await api('create_draft', {parent_id: el.dataset.id});
      await load();
      setTimeout(() => { const t = $(`[data-reply="${CSS.escape(r.id)}"] textarea`); if (t) { t.scrollIntoView({block: 'center'}); t.focus(); } }, 0);
    });
  },

  async allow(el) { await googleFlow('send', el.dataset.id); },
  async 'filter-spam'(el) {
    const s = S.seeds.find(x => x.id === el.dataset.id);
    if (!await confirmBox({title: 'Never send to Spam?', text: `Creates a Gmail filter in ${s.email} so mail from ${S.sender ? S.sender.email : 'your sender'} skips Spam.\n\nIt only affects future emails, and placement results for this inbox won’t show Gmail’s natural decision.`, ok: 'Continue with Google'})) return;
    await googleFlow('filter', s.id);
  },
  async 'filter-important'(el) {
    const s = S.seeds.find(x => x.id === el.dataset.id);
    if (!await confirmBox({title: 'Mark as important?', text: `Creates a Gmail filter in ${s.email} that marks mail from ${S.sender ? S.sender.email : 'your sender'} as important. It only affects future emails.`, ok: 'Continue with Google'})) return;
    await googleFlow('filter_important', s.id);
  },
  async rename(el) {
    const s = S.seeds.find(x => x.id === el.dataset.id);
    const name = await promptBox({title: 'Rename inbox', text: 'Gemini uses this first name in greetings.', label: 'First name', value: s.name || '', placeholder: 'Jane'});
    if (name === null) return;
    await api('rename_seed', {id: s.id, name});
    await load();
  },
  async 'toggle-seed'(el) { const s = S.seeds.find(x => x.id === el.dataset.id); await api('set_seed_enabled', {id: s.id, enabled: !s.enabled}); await load(); },
  async 'remove-seed'(el) {
    const s = S.seeds.find(x => x.id === el.dataset.id);
    if (!await confirmBox({title: 'Remove ' + s.email + '?', text: 'Sent email history is kept. You can connect it again later.', ok: 'Remove', danger: true})) return;
    await api('remove_seed', {id: s.id});
    await load();
  },
  async 'check-filters'(el) {
    await withBusy(el, async () => {
      const r = await api('check_filters');
      const failed = Object.values(r.results).filter(x => x.error).length;
      await load();
      toast(failed ? plural(failed, 'inbox', 'inboxes') + ' could not be read. Reconnect them.' : 'Filters read from Gmail', failed ? 'err' : 'ok');
    });
  },
  async connect() {
    const name = await promptBox({title: 'Connect a Gmail inbox', text: 'You’ll choose the account on Google’s screen and approve reading and sending.', label: 'First name for greetings (optional)', placeholder: 'Jane', ok: 'Continue with Google'});
    if (name === null) return;
    await googleFlow('connect', '', name);
  },

  async 'test-sender'(el) {
    await withBusy(el, async () => {
      const r = await api('test_sender', senderPayload());
      $('#sender-msg').textContent = r.message;
      $('#sender-msg').style.color = 'var(--inbox)';
    }).catch(e => { $('#sender-msg').textContent = e.message; $('#sender-msg').style.color = 'var(--spam)'; });
  },
  async 'save-sender'(el) {
    await withBusy(el, async () => {
      const r = await api('save_sender', senderPayload());
      delete ui.forms.sender;
      await load();
      toast(r.message);
    }).catch(e => { const m = $('#sender-msg'); if (m) { m.textContent = e.message; m.style.color = 'var(--spam)'; } });
  },
  async 'read-site'(el) {
    if ((formVal('brief', 'summary', S.website_summary || '')).trim() && !await confirmBox({title: 'Replace the brief?', text: 'Gemini will read your website and replace the text in the box. Nothing is saved until you choose Save brief.', ok: 'Read website'})) return;
    await withBusy(el, async () => {
      const r = await api('analyze_website');
      ui.forms.brief = {summary: r.summary};
      ui.pendingSources = r.sources;
      render(true);
      toast(r.sources.length ? 'Summary ready. Review and correct it, then save.' : 'Gemini could not confirm which pages it read. Check the summary carefully.');
    });
  },
  async 'save-brief'(el) {
    await withBusy(el, async () => {
      const r = await api('save_website_brief', {summary: formVal('brief', 'summary', S.website_summary || ''), sources: ui.pendingSources || S.website_sources || []});
      delete ui.forms.brief;
      ui.pendingSources = null;
      await load();
      toast(r.message);
    });
  },
  async 'save-ai'(el) {
    await withBusy(el, async () => {
      await api('save_ai', {provider: formVal('ai', 'provider', S.ai_provider === 'gemini' ? 'gemini' : 'none'), model: formVal('ai', 'model', S.ai_model || ''), key: formVal('ai', 'key')});
      delete ui.forms.ai;
      await load();
      toast('Gemini settings saved');
    });
  },
  async 'save-google'(el) {
    await withBusy(el, async () => {
      await api('save_google', {client_id: formVal('google', 'client_id', S.google.client_id), client_secret: formVal('google', 'client_secret')});
      delete ui.forms.google;
      await load();
      toast('Google sign-in saved');
    });
  },
  async 'change-password'(el) {
    await withBusy(el, async () => {
      await api('change_password', {current_password: formVal('pw', 'current'), new_password: formVal('pw', 'next')});
      delete ui.forms.pw;
      S = null;
      ui.authMode = 'login';
      renderAuth('Password updated. Sign in again.');
    });
  }
};

async function googleFlow(purpose, seedId, name = '') {
  const d = await api('google_oauth_start', {purpose, seed_id: seedId, name});
  location.assign(d.url);
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el || !root.contains(el) || !ACTIONS[el.dataset.act]) {
    if (ui.sidebarOpen && !e.target.closest('.sidebar')) { ui.sidebarOpen = false; $('.sidebar')?.classList.remove('open'); }
    return;
  }
  if (el.tagName === 'BUTTON') e.preventDefault();
  try { await ACTIONS[el.dataset.act](el); } catch (err) { toast(err.message, 'err'); }
});

root.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.form) {
    (ui.forms[el.dataset.form] ||= {})[el.name] = el.value;
    if (el.dataset.form === 'brief') { const c = el.closest('.card').querySelector('.card-foot .mono'); if (c) c.textContent = el.value.length + ' / 6000'; }
  }
  if (el.dataset.edit) {
    const id = el.dataset.id;
    (ui.edits[id] ||= {})[el.dataset.edit] = el.value;
    const d = S.drafts.find(x => x.id === id);
    if (d && el.dataset.edit !== 'guidance') {
      const dirty = isDirty(d);
      const save = root.querySelector(`.composer [data-act="save"][data-id="${CSS.escape(id)}"]`);
      if (save) save.disabled = !dirty;
      root.querySelector(`[data-dirty="${CSS.escape(id)}"]`)?.classList.toggle('hidden', !dirty);
    }
  }
});
root.addEventListener('change', e => { const el = e.target; if (el.dataset.form) (ui.forms[el.dataset.form] ||= {})[el.name] = el.value; });

document.addEventListener('keydown', e => {
  if (!S || dialog.open) return;
  const typing = e.target.matches && e.target.matches('input, textarea, select');
  if (typing) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && e.target.dataset.id) { e.preventDefault(); ACTIONS.save({dataset: {id: e.target.dataset.id}}).catch(err => toast(err.message, 'err')); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'n') { e.preventDefault(); composeDialog(); }
  if (ui.page === 'emails' && (e.key === 'j' || e.key === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const list = listOrder();
    if (!list.length) return;
    e.preventDefault();
    const i = list.findIndex(d => d.id === ui.sel);
    const next = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + (e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1)))];
    go('#/emails/' + next.id);
    setTimeout(() => $('.mail-row.on')?.scrollIntoView({block: 'nearest'}), 0);
  }
  if (e.key === 'Escape' && ui.sel) go('#/emails');
});

// ------------------------------------------------------------------ compose dialog

async function composeDialog() {
  const enabled = S.seeds.filter(s => s.enabled);
  const blocker = geminiBlocker();
  if (!S.sender) { toast('Connect the domain sender first', 'err'); go('#/sender'); return; }
  if (!enabled.length) { toast('Connect a seed inbox first', 'err'); go('#/seeds'); return; }
  const lastResult = email => { const d = sentEmails().filter(x => x.seed_email === email).sort((a, b) => ms(b.sent_at) - ms(a.sent_at))[0]; return d ? pill(d) : ''; };
  openDialog(`<form method="dialog" id="compose">
    <div class="dlg-head"><h2>New emails</h2><p>Gemini writes a different, ordinary email for each inbox you pick, using your business brief. Nothing is sent until you review it and press Send.</p></div>
    <div class="dlg-body">
      <div class="field"><div style="display:flex;align-items:center"><span class="label">Seed inboxes</span><button type="button" class="btn ghost sm" style="margin-left:auto" id="pick-all">Select all</button></div>
        <div class="pick">${enabled.map(s => `<label><input type="checkbox" class="checkbox" value="${esc(s.id)}" checked>${avatar(s.email, 'sm')}<div>${esc(s.name || s.email.split('@')[0])}<span>${esc(s.email)}</span></div>${lastResult(s.email)}</label>`).join('')}</div></div>
      <div class="field"><label class="label" for="c-theme">Theme or instructions <span class="faint">(optional)</span></label><textarea class="input" id="c-theme" rows="3" maxlength="500" placeholder="e.g. autumn opening hours, a thank-you after a recent order, ask for feedback"></textarea></div>
      ${blocker ? `<div class="callout warn" style="margin-top:14px">${icon('alert')}<div>${esc(blocker)}. You can still create blank drafts.</div></div>` : ''}
      <p class="form-error" id="c-error" style="text-align:left"></p>
    </div>
    <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn" id="c-blank">Blank drafts</button>
      <button type="button" class="btn primary" id="c-go" ${blocker ? 'disabled' : ''}>${icon('sparkles')}<span>Write with Gemini</span></button></div></form>`, d => {
    const picked = () => [...d.querySelectorAll('.pick input:checked')].map(i => i.value);
    const update = () => { const n = picked().length; $('#c-go span', d).textContent = n ? `Write ${plural(n, 'email')}` : 'Write with Gemini'; $('#c-go', d).disabled = !!blocker || !n; $('#c-blank', d).disabled = !n; };
    d.querySelector('.pick').addEventListener('change', update);
    $('#pick-all', d).onclick = () => { const all = d.querySelectorAll('.pick input'); const on = [...all].some(i => !i.checked); all.forEach(i => { i.checked = on; }); update(); };
    const run = async (btnEl, fn) => {
      $('#c-error', d).textContent = '';
      d.querySelectorAll('.dlg-foot .btn').forEach(b => { b.disabled = true; });
      btnEl.innerHTML = '<span class="spin"></span><span>' + (btnEl.id === 'c-go' ? 'Writing…' : 'Creating…') + '</span>';
      try { await fn(); } catch (err) { $('#c-error', d).textContent = err.message; btnEl.innerHTML = btnEl.id === 'c-go' ? icon('sparkles') + '<span>Try again</span>' : '<span>Blank drafts</span>'; d.querySelectorAll('.dlg-foot .btn').forEach(b => { b.disabled = false; }); update(); }
    };
    $('#c-go', d).onclick = e => run(e.currentTarget, async () => {
      const r = await api('generate_drafts', {seed_ids: picked(), theme: $('#c-theme', d).value});
      closeDialog('ok');
      ui.filter = 'draft';
      await load();
      toast(r.message);
      if (r.ids[0]) go('#/emails/' + r.ids[0]);
    });
    $('#c-blank', d).onclick = e => run(e.currentTarget, async () => {
      let first = '';
      for (const id of picked()) { const r = await api('create_draft', {seed_id: id}); first = first || r.id; }
      closeDialog('ok');
      ui.filter = 'draft';
      await load();
      if (first) go('#/emails/' + first);
    });
    update();
  });
}

// ------------------------------------------------------------------ start

const GOOGLE_RESULT = {connected: 'Google inbox connected', send_enabled: 'Sending replies is now allowed', filter_added: 'Gmail filter saved', filter_exists: 'That Gmail filter was already in place'};

async function start(user) {
  const ok = await load();
  if (!ok) return;
  S.user = user || S.user;
  const params = new URLSearchParams(location.search);
  const result = params.get('google');
  if (result) {
    history.replaceState(null, '', location.pathname + '#/seeds');
    toast(GOOGLE_RESULT[result] || ('Google connection failed' + (params.get('reason') ? ': ' + params.get('reason') : '')), GOOGLE_RESULT[result] ? 'ok' : 'err');
  }
  route();
  refreshPlacements(true);
}

(async () => {
  try {
    const status = await api('status');
    if (status.user) { await start(status.user); return; }
    ui.authMode = status.setup_required ? 'setup' : 'login';
  } catch (e) {
    ui.authMode = 'login';
    renderAuth(e.message);
    return;
  }
  renderAuth();
})();
