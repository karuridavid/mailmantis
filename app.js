'use strict';
/* Mail Mantis dashboard. Plain JS, no build step.
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
  pendingRender: false, pollTimer: null, sidebarOpen: false, domain: null, pendingSources: {},
  checks: {}, inviteUrl: ''
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
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  updown: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
  chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  google: '<path d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.5h3.3c1.9-1.8 3-4.4 3-7.4Z"/><path d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path d="M6.5 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9Z"/><path d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.5 10A5.9 5.9 0 0 1 12 5.9Z"/>'
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
// Praying mantis in profile: upright thorax, folded raptorial forelegs, leaf-shaped abdomen.
const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="var(--mantis, #8cc461)" stroke-linecap="round" stroke-linejoin="round"><path d="M44.5 10.5 Q49 5.5 54.5 4.5" stroke-width="1.3"/><path d="M42.5 11 Q44.5 5 48.5 2.5" stroke-width="1.3"/><path d="M30.5 38 L39.5 16.5" stroke-width="4.2"/><path d="M36.5 23.5 L47.5 29.5 L45.5 20.5 L47.5 19" stroke-width="3.2"/><path d="M31 39.5 L36 47.5 L40 57" stroke-width="2.1"/><path d="M28.5 40.5 L24.5 49 L27.5 57.5" stroke-width="2.1"/><path d="M26 41 L18 49.5 L13.5 57.5" stroke-width="2.1"/></g><g fill="var(--mantis, #8cc461)"><path d="M33 36.5 C26.5 34.5 13 38.5 4.5 49.5 C16 50 28 45 33.5 40 Z"/><path d="M35.5 13.5 L47 9.5 L44.5 19.5 Z"/></g><circle cx="44.2" cy="12.3" r="1.7" fill="var(--mantis-eye, #0b0b0d)"/></svg>';

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
const PROVIDERS = {gmail: 'Gmail', workspace: 'Google Workspace', outlook: 'Outlook', yahoo: 'Yahoo Mail', aol: 'AOL Mail', icloud: 'iCloud Mail', imap: 'IMAP'};
const seedKind = s => s ? ({google_oauth: 'google', microsoft_oauth: 'microsoft'})[s.auth_type] || 'imap' : 'imap';
const canReply = s => s && (seedKind(s) !== 'google' || s.gmail_send_enabled);
const checkedPlacement = d => ['Inbox', 'Spam', 'Other folder'].includes(d.placement);

// Status model: k is the colour key (draft ready sent inbox tab spam).
function st(d) {
  if (d.status === 'draft') return {k: 'draft', label: 'Draft'};
  if (d.status === 'ready') return {k: 'ready', label: 'Ready to send'};
  if (d.kind === 'reply') return {k: 'sent', label: 'Reply sent'};
  if (d.placement === 'Inbox') {
    if (d.inbox_tab && !['Primary', 'Focused'].includes(d.inbox_tab)) return {k: 'tab', label: 'Inbox · ' + d.inbox_tab, short: d.inbox_tab};
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

// Everything in the dashboard is scoped to the active sender domain.
function scope(d) {
  if (!d.drafts) return d;  // Member accounts get only their own inboxes.
  const email = d.sender ? d.sender.email.toLowerCase() : null;
  const domain = d.drafts.filter(x => x.kind === 'domain' && email && x.from_email.toLowerCase() === email);
  const ids = new Set(domain.map(x => x.id));
  const replies = d.drafts.filter(x => x.kind === 'reply' && (ids.has(x.parent_id) || (email && x.to_email.toLowerCase() === email)));
  return {...d, drafts: domain.concat(replies), activity: d.activity.filter(a => ids.has(a.draft_id))};
}

async function load(force = true) {
  try {
    S = scope(await api('get_config'));
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

const PAGES = {overview: 'Overview', emails: 'Emails', seeds: 'Seed inboxes', domains: 'Domains', people: 'People', log: 'Placement log', settings: 'Settings'};

function route() {
  let [, page, id] = (location.hash || '#/overview').split('/');
  if (page === 'sender') page = 'domains';
  ui.page = PAGES[page] ? page : 'overview';
  ui.sel = ui.page === 'emails' && id ? decodeURIComponent(id) : null;
  if (ui.page === 'domains') ui.domain = id ? decodeURIComponent(id) : null;
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
  root.innerHTML = S.role === 'member' ? memberView() : shell();
  if (scroll.key === ui.page + ui.sel) {
    if ($('.mail-list') && scroll.list) $('.mail-list').scrollTop = scroll.list;
    if ($('.detail') && scroll.detail) $('.detail').scrollTop = scroll.detail;
    window.scrollTo(0, scroll.win);
  }
  document.title = (S.role === 'member' ? 'Your inboxes' : PAGES[ui.page]) + ' · Mail Mantis';
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
      <button class="workspace" data-act="switch-domain" title="Switch the active domain">
        <span class="ws-logo">${LOGO}</span>
        <span class="ws-text"><b>${sender ? esc(sender.domain) : 'Mail Mantis'}</b><small>${sender ? (S.senders.length > 1 ? plural(S.senders.length, 'domain') : 'Mail Mantis') : 'No domain yet'}</small></span>
        ${icon('updown')}</button>
      ${navItem('overview', 'overview', 'Overview')}
      ${navItem('emails', 'mail', 'Emails', ready || '')}
      ${navItem('seeds', 'users', 'Seed inboxes')}
      ${navItem('domains', 'globe', 'Domains')}
      ${navItem('people', 'users', 'People', S.invites.length || '')}
      ${navItem('log', 'activity', 'Placement log')}
      <div class="sidebar-spacer"></div>
      ${navItem('settings', 'settings', 'Settings')}
      <button class="nav-item" data-act="theme" title="Theme: ${theme}">${icon(theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor')}Theme<span class="badge plain">${theme}</span></button>
      <div class="account"><span class="avatar sm" style="--h:${hue(S.user.email)}">${esc(S.user.email.charAt(0).toUpperCase())}</span>
        <span class="acc-text"><b>${esc(S.user.email.split('@')[0])}</b><small>${esc(S.user.email)}</small></span>
        <button class="btn ghost sm icon" data-act="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button></div>
    </aside>
    <main class="main"><div class="frame">${({overview, emails, seeds, domains, people, log, settings})[ui.page]()}</div></main>
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
  const DAY = 86400000, now = Date.now();
  const inWindow = (d, from, to) => ms(d.sent_at) >= now - from * DAY && ms(d.sent_at) < now - to * DAY;
  const week = sentEmails().filter(d => inWindow(d, 7, 0)), prev = sentEmails().filter(d => inWindow(d, 14, 7));
  const rateOf = list => { const c = list.filter(checkedPlacement); return c.length ? c.filter(d => d.placement === 'Inbox').length / c.length * 100 : null; };
  const spamOf = list => list.filter(d => d.placement === 'Spam').length;
  const repliesIn = (from, to) => S.drafts.filter(d => d.kind === 'reply' && d.status === 'sent' && ms(d.sent_at) >= now - from * DAY && ms(d.sent_at) < now - to * DAY).length;
  const delta = (cur, old, {pct = false, lowerIsBetter = false, neutral = false} = {}) => {
    if (cur === null || old === null || (!pct && !old && !cur)) return '<span class="faint">No earlier data</span>';
    const diff = pct ? Math.round(cur - old) : cur - old;
    const good = lowerIsBetter ? diff <= 0 : diff >= 0;
    const text = (diff > 0 ? '+' : '') + diff + (pct ? ' pts' : '');
    return `<span class="${diff === 0 || neutral ? 'same' : good ? 'up' : 'down'}">${text}</span> vs previous 7 days`;
  };
  const rate = rateOf(week);
  const kpi = (title, ico, value, sub) => `<div class="card kpi"><div class="kpi-top"><span>${title}</span>${icon(ico)}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;

  const steps = [
    ['Sender domain', 'Connect and test SMTP', !!(S.sender && S.sender.verified_at), '#/domains'],
    ['Business brief', 'Describe the business', !!S.website_summary, '#/domains'],
    ['Gemini key', 'For writing drafts', S.ai_provider === 'gemini' && S.has_ai_key, '#/settings'],
    ['Inbox sign-in', 'Google, Microsoft or IMAP', !!(S.google.ready || S.microsoft.ready || S.seeds.some(x => seedKind(x) === 'imap')), '#/settings'],
    ['Seed inbox', 'Connect a Gmail inbox', S.seeds.some(x => x.enabled), '#/seeds'],
    ['First email', 'Draft and send one', sentEmails().length > 0, '#/emails']
  ];
  const done = steps.filter(x => x[2]).length;
  const setup = done === steps.length ? '' : `<div class="card"><div class="card-head"><h2>Get set up</h2><span class="sub">${done} of ${steps.length} done</span></div>
    <div class="setup">${steps.map(([t, sub, ok, href], i) => `<a class="step ${ok ? 'done' : ''}" href="${href}"><span class="n">${ok ? icon('check') : i + 1}</span><b>${t}</b><span>${sub}</span></a>`).join('')}</div></div>`;

  return header('Overview', S.sender ? esc(S.sender.domain) : '',
      btn('refresh', 'Refresh placement', {ico: 'refresh', cls: 'hide-sm'}) + btn('compose', 'Write emails', {ico: 'plus', cls: 'primary'})) +
    `<div class="page"><div class="stack">${setup}
      <div class="kpis">
        ${kpi('Inbox rate', 'inbox', rate === null ? '–' : Math.round(rate) + '%', delta(rate, rateOf(prev), {pct: true}))}
        ${kpi('Emails sent', 'send', week.length, delta(week.length, prev.length, {neutral: true}))}
        ${kpi('Landed in spam', 'alert', spamOf(week), delta(spamOf(week), spamOf(prev), {lowerIsBetter: true}))}
        ${kpi('Replies sent', 'reply', repliesIn(7, 0), delta(repliesIn(7, 0), repliesIn(14, 7)))}
      </div>
      <div class="grid-2">
        <div class="card chart-card"><div class="card-head col"><div><h2>Placement performance</h2><p class="sub">Where each day’s emails landed, last 14 days.</p></div><div class="right">${legend()}</div></div>${placementChart()}</div>
        <div class="card actions-card"><div class="card-head col"><div><h2>Required actions</h2><p class="sub">Things to send, review or fix.</p></div></div>${requiredActions()}</div>
      </div>
      <div class="grid-2 rev">
        <div class="card"><div class="card-head col"><div><h2>Email status</h2><p class="sub">Every email for ${S.sender ? esc(S.sender.domain) : 'this domain'}, by where it stands now.</p></div></div>${statusDonut()}</div>
        <div class="card"><div class="card-head col"><div><h2>Placement by inbox</h2><p class="sub">How each seed inbox has filed your mail over the last 30 days.</p></div></div>${inboxBars()}</div>
      </div>
    </div></div>`;
}

const PLACE_KEYS = [['inbox', 'Primary'], ['tab', 'Other tab'], ['spam', 'Spam'], ['sent', 'Waiting']];
function legend(keys = PLACE_KEYS) {
  return `<div class="legend">${keys.map(([k, l]) => `<span><i class="dot s-${k}"></i>${l}</span>`).join('')}</div>`;
}

function placementChart() {
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d); }
  const per = days.map(day => {
    const list = sentEmails().filter(d => new Date(d.sent_at).toDateString() === day.toDateString());
    return PLACE_KEYS.map(([k, l]) => [k, l, list.filter(d => st(d).k === k).length]);
  });
  const peak = Math.max(...per.map(p => p.reduce((a, x) => a + x[2], 0)));
  const step = Math.max(1, Math.ceil(peak / 4));
  const max = step * 4;
  const ticks = [4, 3, 2, 1, 0].map(i => i * step);
  if (!peak) return `<div class="chart-empty">${empty('chart', 'No sends in the last 14 days', 'Placement results appear here once you send emails from this domain.')}</div>`;
  return `<div class="pchart"><div class="yaxis">${ticks.map(t => `<span>${t}</span>`).join('')}</div>
    <div class="plot">${ticks.map((t, i) => `<i class="grid" style="top:${i * 25}%"></i>`).join('')}
      <div class="cols14">${per.map((p, i) => {
        const total = p.reduce((a, x) => a + x[2], 0);
        const label = days[i].toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
        return `<div class="pcol" tabindex="0">${total ? `<div class="stackbar" style="height:${total / max * 100}%">${p.filter(x => x[2]).map(([k, , n]) => `<span class="s-${k}" style="flex:${n}"></span>`).join('')}</div>` : ''}
          <div class="tip"><b>${label}</b>${total ? p.filter(x => x[2]).map(([k, l, n]) => `<div><i class="dot s-${k}"></i>${l}<span>${n}</span></div>`).join('') : '<div>No sends</div>'}</div></div>`;
      }).join('')}</div></div>
    <div class="xaxis">${days.map((d, i) => `<span>${i % 2 ? '' : d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>`).join('')}</div></div>`;
}

function requiredActions() {
  const items = [];
  const ready = S.drafts.filter(d => d.status === 'ready');
  const drafts = S.drafts.filter(d => d.status === 'draft');
  const spam = sentEmails().filter(d => d.placement === 'Spam' && Date.now() - ms(d.sent_at) < 14 * 86400000);
  const stale = sentEmails().filter(d => waiting(d) && Date.now() - ms(d.sent_at) > 20 * 60000 && Date.now() - ms(d.sent_at) < 3 * 86400000);
  const unreplied = sentEmails().filter(d => ['Inbox', 'Other folder'].includes(d.placement) && !repliesOf(d.id).length && Date.now() - ms(d.sent_at) < 7 * 86400000);
  const noSend = S.seeds.filter(x => x.auth_type === 'google_oauth' && !x.gmail_send_enabled);
  const item = (k, href, title, sub, extra = '') => `<a class="action-item" href="${href}"${extra}><i class="dot s-${k}"></i><span><b>${title}</b><small>${sub}</small></span></a>`;
  spam.slice(0, 2).forEach(d => items.push(item('spam', '#/emails/' + esc(d.id), 'Landed in Spam', esc(d.subject) + ' at ' + esc(nameOf(d.seed_email)))));
  if (noSend.length) items.push(item('spam', '#/seeds', 'Reply permission missing', esc(noSend.map(x => x.email).join(', ')) + ' can’t send replies'));
  if (ready.length) items.push(item('ready', '#/emails', plural(ready.length, 'email') + ' ready to send', 'Review each one and press Send', ' data-act="filter" data-v="ready"'));
  if (drafts.length) items.push(item('draft', '#/emails', plural(drafts.length, 'draft') + ' to review', 'Edit, then mark ready', ' data-act="filter" data-v="draft"'));
  if (stale.length) items.push(`<a class="action-item" href="#" data-act="refresh"><i class="dot s-tab"></i><span><b>${plural(stale.length, 'email')} not found yet</b><small>Delivery can be slow. Check again</small></span></a>`);
  if (unreplied.length) items.push(item('inbox', '#/emails/' + esc(unreplied[0].id), 'Reply to delivered mail', plural(unreplied.length, 'delivered email') + ' without a reply'));
  return (items.length ? `<div class="action-list">${items.slice(0, 5).join('')}</div>` : empty('check', 'All clear', 'Nothing needs your attention right now.'))
    + `<div class="card-pad"><a class="btn full" href="#/emails">View all emails</a></div>`;
}

function statusDonut() {
  const all = domainEmails();
  const parts = [['draft', 'Draft', all.filter(d => d.status === 'draft').length], ['ready', 'Ready', all.filter(d => d.status === 'ready').length],
    ['sent', 'Waiting', all.filter(waiting).length], ['inbox', 'Primary', all.filter(d => d.status === 'sent' && st(d).k === 'inbox').length],
    ['tab', 'Other tab', all.filter(d => d.status === 'sent' && st(d).k === 'tab').length], ['spam', 'Spam', all.filter(d => d.status === 'sent' && st(d).k === 'spam').length]];
  const total = parts.reduce((a, x) => a + x[2], 0);
  if (!total) return empty('mail', 'No emails yet', 'Write your first emails to see them here.');
  let at = 0;
  const stops = parts.filter(x => x[2]).map(([k, , n]) => { const from = at; at += n / total * 100; return `var(--${k}) ${from}% ${at}%`; }).join(', ');
  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"><div><b>${total}</b><span>emails</span></div></div>
    <div class="donut-legend">${parts.map(([k, l, n]) => `<div><i class="dot s-${k}"></i><span>${l}</span><b>${n}</b></div>`).join('')}</div></div>`;
}

function inboxBars() {
  if (!S.seeds.length) return empty('users', 'No seed inboxes yet', 'Connect Gmail inboxes you own to see how each one files your mail.', '<a class="btn sm" href="#/seeds">Connect an inbox</a>');
  const since = Date.now() - 30 * 86400000;
  return `<div class="hbars">${S.seeds.map(seed => {
    const list = sentEmails().filter(d => d.seed_email === seed.email && ms(d.sent_at) >= since);
    const counts = PLACE_KEYS.map(([k, l]) => [k, l, list.filter(d => st(d).k === k).length]);
    const total = list.length;
    const bar = total ? counts.filter(x => x[2]).map(([k, l, n]) => { const pct = Math.round(n / total * 100);
      return `<span class="s-${k}" style="flex:${n}" title="${l}: ${n} of ${total}">${pct >= 12 ? pct + '%' : ''}</span>`; }).join('') : '<span class="none">No sends yet</span>';
    return `<div class="hbar-row ${seed.enabled ? '' : 'paused'}"><span class="hbar-name" title="${esc(seed.email)}">${esc(seed.name || seed.email.split('@')[0])}</span><div class="hbar">${bar}</div><span class="hbar-n">${total}</span></div>`;
  }).join('')}</div><div class="card-pad center">${legend()}</div>`;
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
        S.drafts.length ? '' : btn('compose', 'Write emails', {ico: 'plus', cls: 'primary sm'}));
  return header('Emails', sentEmails().length + ' sent',
      btn('refresh', 'Refresh placement', {ico: 'refresh', cls: 'hide-sm'}) + btn('compose', 'Write emails', {ico: 'plus', cls: 'primary'})) +
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
  const seed = seedOf(d.seed_email);
  const where = PROVIDERS[seed ? seed.provider : 'gmail'] || 'The inbox';
  const icons = {inbox: 'inbox', tab: 'folder', spam: 'alert', sent: 'clock'};
  const title = s.k === 'sent' ? (d.placement === 'Not found' ? 'Not found yet' : 'Waiting for the first check') : s.label;
  const why = {
    inbox: `${where} delivered this to the ${d.inbox_tab === 'Focused' ? 'Focused' : 'Primary'} inbox.`,
    tab: d.placement === 'Other folder' ? 'Found outside Inbox and Spam (archived or in another folder).' : `Delivered, but ${where} sorted it into ${d.inbox_tab === 'Other' ? 'the Other inbox' : 'the ' + d.inbox_tab + ' tab'}.`,
    spam: `${where} put this in spam. Use Not spam below to move it to the inbox, then reply. Also check SPF, DKIM and DMARC for your domain.`,
    sent: d.placement === 'Not found' ? 'The message hasn’t shown up yet. Delivery can take a few minutes.' : 'The dashboard checks automatically while it’s open.'
  }[s.k];
  const labels = (d.gmail_labels || '').split(',').filter(Boolean);
  const marked = labels.some(l => ['IMPORTANT', 'FLAGGED'].includes(l));
  const found = ['Inbox', 'Spam', 'Other folder'].includes(d.placement);
  const actions = found ? `<div class="placement-actions">
      ${d.placement !== 'Inbox' ? btn('message-action', 'Not spam · move to inbox', {ico: 'inbox', cls: 'sm', id: d.id, attrs: 'data-v="not_spam"'}) : ''}
      ${marked ? '<span class="pill s-inbox">Marked important</span>' : btn('message-action', seedKind(seed) === 'imap' ? 'Flag as important' : 'Mark important', {ico: 'star', cls: 'sm', id: d.id, attrs: 'data-v="important"'})}
      <span class="hint">Only happens when you click. Checks never change anything.</span></div>` : '';
  return `<div class="section-title">Placement</div>
    <div class="placement s-${s.k}"><span class="big">${icon(icons[s.k])}</span><div><h3>${esc(title)}</h3><p>${esc(why)}${d.checked_at ? ` <span class="faint">Checked ${ago(d.checked_at, true)}.</span>` : ''}</p>${labels.length ? `<div class="labels">${labels.map(l => `<span class="chip">${esc(l)}</span>`).join('')}</div>` : ''}</div>
    ${btn('check', 'Check again', {ico: 'refresh', cls: 'sm', id: d.id})}</div>${actions}`;
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
  const blocked = seed && !canReply(seed);
  return `<div class="section-title">Replies <span class="count">${reps.length}</span></div>
    ${blocked ? `<div class="callout warn">${icon('key')}<div>${esc(nameOf(d.seed_email))} can’t send replies yet. ${btn('allow', 'Allow sending replies', {cls: 'sm', id: seed.id})}</div></div>` : ''}
    ${list}${open ? '' : `<div style="margin-top:12px">${btn('reply', reps.length ? 'Reply again' : 'Reply from ' + esc(nameOf(d.seed_email)), {ico: 'reply', id: d.id})}</div>`}`;
}

// ------------------------------------------------------------------ seeds

function filterState(v) {
  if (v === true) return `<span class="pill s-inbox">On</span>`;
  if (v === false) return `<span class="pill s-draft">Off</span>`;
  return `<span class="pill plain s-draft" title="Choose Check filters to read it from the inbox">Unknown</span>`;
}

function seeds() {
  const cards = S.seeds.map(s => {
    const kind = seedKind(s);
    const sent = sentEmails().filter(d => d.seed_email === s.email).sort((a, b) => ms(a.sent_at) - ms(b.sent_at));
    const last = sent.slice(-10);
    const theirs = s.owner ? {disabled: true, title: 'Only ' + (s.owner.name || s.owner.email) + ' can approve this, from their own account'} : {};
    const rule = (label, value, act) => `<div class="kv-row"><span class="k">${label}</span>${filterState(value)}${value !== true ? btn(act, 'Add', {cls: 'sm', id: s.id, ...theirs}) : ''}</div>`;
    let rows = '';
    if (kind === 'google') rows = `<div class="kv-row"><span class="k">Send replies</span>${s.gmail_send_enabled ? '<span class="pill s-inbox">Allowed</span>' : btn('allow', 'Allow', {cls: 'sm', id: s.id, ...theirs})}</div>`
      + rule('Never send to Spam', s.filter_never_spam, 'filter-spam') + rule('Mark important', s.filter_important, 'filter-important');
    else if (kind === 'microsoft') rows = `<div class="kv-row"><span class="k">Send replies</span><span class="pill s-inbox">Allowed</span></div>`
      + rule('Always Focused', s.filter_never_spam, 'filter-spam') + rule('Mark important rule', s.filter_important, 'filter-important');
    else rows = `<div class="kv-row"><span class="k">Send replies</span><span class="pill s-inbox">Via SMTP</span></div>
      <div class="kv-row"><span class="k">Filters</span><span class="hint" style="text-align:right">Not available over IMAP. Use Not spam and Flag on each email.</span></div>
      <div class="kv-row"><span class="k">Server</span><span class="mono small muted">${esc(s.imap_host || (S.imap_presets[s.provider] || {}).imap_host || 'imap.gmail.com')}</span></div>`;
    return `<div class="card seed-card ${s.enabled ? '' : 'paused'}">
      <div class="card-head">${avatar(s.email)}<div class="who"><b>${esc(s.name || s.email.split('@')[0])}</b><span>${esc(s.email)}${s.owner ? ' · added by ' + esc(s.owner.name || s.owner.email) : ''}</span></div>
        <span class="pill plain">${esc(PROVIDERS[s.provider] || s.provider)}</span></div>
      <div class="kv">${rows}
        <div class="kv-row"><span class="k">Recent placement</span><div class="cells">${last.length ? last.map(d => { const x = st(d); return `<a class="cell s-${x.k} ${x.k === 'sent' ? 'wait' : ''}" href="#/emails/${esc(d.id)}" title="${esc(d.subject + ' · ' + x.label)}"></a>`; }).join('') : '<span class="faint small">None yet</span>'}</div></div>
      </div>
      <div class="card-foot">${btn('rename', 'Rename', {cls: 'sm ghost', ico: 'pencil', id: s.id})}${btn('toggle-seed', s.enabled ? 'Pause' : 'Resume', {cls: 'sm ghost', ico: s.enabled ? 'pause' : 'play', id: s.id})}
        <div class="right">${btn('remove-seed', 'Remove', {cls: 'sm ghost danger', ico: 'trash', id: s.id})}</div></div>
    </div>`;
  }).join('');
  const checked = S.seeds.map(s => s.filters_checked_at).filter(Boolean).sort().pop();
  return header('Seed inboxes', plural(S.seeds.filter(s => s.enabled).length, 'active inbox', 'active inboxes'),
      btn('check-filters', 'Check filters', {ico: 'shield', cls: 'hide-sm', disabled: !S.sender || !S.seeds.some(s => seedKind(s) !== 'imap')}) +
      btn('connect', 'Connect inbox', {ico: 'plus', cls: 'primary'})) +
    `<div class="page"><div class="stack">
      ${S.google.ready || S.microsoft.ready ? '' : `<div class="callout">${icon('key')}<div>To connect Gmail or Outlook inboxes with sign-in, add a Google or Microsoft app under <a href="#/settings"><b>Settings</b></a>. Yahoo, iCloud, AOL and other IMAP inboxes only need an app password.</div></div>`}
      <div class="callout">${icon('shield')}<div><b>About filters.</b> Gmail filters can keep ${S.sender ? esc(S.sender.email) : 'your sender'} out of Spam and mark it important; Outlook can keep it in Focused and mark it important. IMAP inboxes have no filters, so use Not spam and Flag on each email. Filters only affect mail that arrives afterwards and they change placement results, so leave them off where you want the provider’s natural decision.${checked ? ` <span class="faint">Filters last read ${ago(checked, true)}.</span>` : ''}</div></div>
      ${S.seeds.length ? `<div class="seed-grid">${cards}</div>` : `<div class="card">${empty('users', 'No seed inboxes', 'Connect Gmail, Outlook, Yahoo, iCloud or other inboxes you own. They receive your domain’s emails and can reply from here.', btn('connect', 'Connect inbox', {ico: 'plus', cls: 'primary sm'}))}</div>`}
    </div></div>`;
}

// ------------------------------------------------------------------ sender

function domains() {
  const list = S.senders;
  const id = ui.domain === 'new' || !list.length ? 'new' : (list.some(x => x.id === ui.domain) ? ui.domain : (S.sender || list[0]).id);
  const sel = id === 'new' ? null : list.find(x => x.id === id);
  const items = list.map(x => `<a class="domain-item ${x.id === id ? 'on' : ''}" href="#/domains/${esc(x.id)}"><span class="avatar sm" style="--h:${hue(x.domain)}">${esc(x.domain.charAt(0).toUpperCase())}</span><span><b>${esc(x.domain)}</b><small>${esc(x.email)}</small></span>${x.active ? '<span class="pill s-inbox">Active</span>' : ''}</a>`).join('')
    + `<a class="domain-item add ${id === 'new' ? 'on' : ''}" href="#/domains/new">${icon('plus')}<span><b>Add a domain</b><small>Another sender to warm later</small></span></a>`;
  return header('Domains', 'One domain is warmed at a time') + `<div class="page"><div class="domains">
    <div><div class="card domain-list">${items}</div>
      <p class="hint" style="margin:10px 4px 0">The active domain is used for drafts, sending and filters, and the dashboard shows its results. Switching keeps each domain’s history.</p></div>
    <div class="stack">${domainEditor(sel)}</div></div></div>`;
}

function domainEditor(sd) {
  const key = 'sender:' + (sd ? sd.id : 'new');
  const v = (name, fallback) => esc(formVal(key, name, fallback ?? ''));
  const status = !sd ? '' : sd.verified_at ? `<span class="pill s-inbox">Tested ${ago(sd.verified_at, true)}</span>` : '<span class="pill s-tab">Not tested</span>';
  const connection = `<div class="card"><div class="card-head"><h2>${sd ? esc(sd.domain) : 'New sender domain'}</h2>${sd && sd.active ? '<span class="pill s-inbox">Active</span>' : ''}<div class="right">${status}</div></div>
    <div class="card-body">
      <div class="field-row"><div class="field"><label class="label" for="f-from-name">From name</label><input class="input" id="f-from-name" data-form="${key}" name="from_name" value="${v('from_name', sd && sd.from_name)}" placeholder="Fernhill Pottery" maxlength="100"></div>
        <div class="field"><label class="label" for="f-email">Sender address</label><input class="input" id="f-email" type="email" data-form="${key}" name="email" value="${v('email', sd && sd.email)}" placeholder="hello@example.com"></div></div>
      <div class="field-row" style="margin-top:14px"><div class="field"><label class="label" for="f-domain">Domain</label><input class="input" id="f-domain" data-form="${key}" name="domain" value="${v('domain', sd && sd.domain)}" placeholder="example.com"></div>
        <div class="field"><label class="label" for="f-host">SMTP server</label><input class="input" id="f-host" data-form="${key}" name="smtp_host" value="${v('smtp_host', sd && sd.smtp_host)}" placeholder="smtp-relay.brevo.com"></div></div>
      <div class="field-row" style="margin-top:14px"><div class="field"><label class="label" for="f-port">Port</label><select class="input" id="f-port" data-form="${key}" name="smtp_port">${[587, 465].map(port => `<option value="${port}" ${String(formVal(key, 'smtp_port', (sd && sd.smtp_port) || 587)) === String(port) ? 'selected' : ''}>${port} · ${port === 587 ? 'STARTTLS' : 'SSL'}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="f-user">SMTP login</label><input class="input" id="f-user" data-form="${key}" name="smtp_username" value="${v('smtp_username', sd && sd.smtp_username)}" placeholder="Same as sender address"></div></div>
      <div class="field" style="margin-top:14px"><label class="label" for="f-pass">SMTP password or key</label><input class="input" id="f-pass" type="password" autocomplete="new-password" data-form="${key}" name="password" value="${v('password')}" placeholder="${sd ? 'Saved. Leave blank to keep it' : ''}">
        <span class="hint">Brevo: <span class="mono">smtp-relay.brevo.com</span>, port 587, your SMTP login and SMTP key. Cloudflare Email Routing can’t send.</span></div>
    </div>
    <div class="card-foot">${sd && !sd.active ? btn('activate', 'Make active', {cls: 'sm', id: sd.id}) : ''}${sd ? btn('remove-domain', 'Remove', {cls: 'sm ghost danger', ico: 'trash', id: sd.id}) : ''}
      <span class="hint" id="sender-msg"></span><div class="right">${btn('test-sender', 'Test connection', {id: sd ? sd.id : ''})}${btn('save-sender', sd ? 'Save' : 'Add domain', {cls: 'primary', id: sd ? sd.id : ''})}</div></div></div>`;
  if (!sd) return connection;
  const bkey = 'brief:' + sd.id;
  const brief = formVal(bkey, 'summary', sd.brief || '');
  const sources = ui.pendingSources[sd.id] || sd.brief_sources || [];
  const aiBlock = (S.ai_provider !== 'gemini' || !S.has_ai_key) ? 'Add a Gemini key in Settings' : '';
  return connection + `<div class="card"><div class="card-head"><h2>Business brief</h2><div class="right">${btn('read-site', 'Read website', {ico: 'sparkles', cls: 'sm', id: sd.id, disabled: !!aiBlock, title: aiBlock})}</div></div>
    <div class="card-body"><p class="muted" style="margin:0 0 12px;font-size:13px">Gemini only uses facts from this brief when it writes for ${esc(sd.domain)}. Read the website, correct anything wrong, then save, or write it yourself.</p>
      <textarea class="input" data-form="${bkey}" name="summary" rows="8" maxlength="6000" placeholder="What the business does, who it serves, its main products or services, and its tone.">${esc(brief)}</textarea>
      <div class="labels" style="margin-top:10px">${sources.map(u => `<span class="chip">${icon('globe')}&nbsp;${esc(u.replace(/^https?:\/\//, ''))}</span>`).join('')}${sd.brief_updated ? `<span class="faint small" style="align-self:center">Saved ${ago(sd.brief_updated, true)}</span>` : ''}</div></div>
    <div class="card-foot"><span class="hint mono" data-count="${esc(sd.id)}">${brief.length} / 6000</span><div class="right">${btn('save-brief', 'Save brief', {cls: 'primary', id: sd.id})}</div></div></div>`;
}

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
        <div style="margin-top:14px">${btn('save-google', 'Save', {cls: 'primary'})}</div>`}
        ${checkBlock('google', g.ready)}</div></section>

    <section class="settings-section"><div><h3>Microsoft sign-in</h3><p>App registration used to connect Outlook.com and Microsoft 365 inboxes. ${S.microsoft.ready ? '<span class="pill s-inbox" style="margin-top:8px">Ready</span>' : '<span class="pill s-tab" style="margin-top:8px">Not set</span>'}</p></div>
      <div><div class="field"><span class="label">Redirect URI (Web platform)</span><div class="copy"><code>${esc(S.microsoft.redirect_uri)}</code>${btn('copy', '', {ico: 'copy', cls: 'sm icon ghost', attrs: `data-v="${esc(S.microsoft.redirect_uri)}"`, title: 'Copy'})}</div>
        <span class="hint">Register an app in Microsoft Entra for “Accounts in any organizational directory and personal Microsoft accounts”, add this redirect URI, and create a client secret.</span></div>
        ${S.microsoft.source === 'env' ? `<div class="callout" style="margin-top:14px">${icon('key')}<div>Set by environment variables on this server.</div></div>`
        : `<div class="field" style="margin-top:14px"><label class="label" for="s-mid">Application (client) ID</label><input class="input mono" id="s-mid" data-form="microsoft" name="client_id" value="${esc(formVal('microsoft', 'client_id', S.microsoft.client_id))}" placeholder="00000000-0000-0000-0000-000000000000"></div>
        <div class="field"><label class="label" for="s-msecret">Client secret value</label><input class="input" id="s-msecret" type="password" autocomplete="new-password" data-form="microsoft" name="client_secret" value="${esc(formVal('microsoft', 'client_secret'))}" placeholder="${S.microsoft.ready ? 'Saved. Leave blank to keep it' : ''}"></div>
        <div style="margin-top:14px">${btn('save-microsoft', 'Save', {cls: 'primary'})}</div>`}
        ${checkBlock('microsoft', S.microsoft.ready)}</div></section>

    <section class="settings-section"><div><h3>Password</h3><p>Signed in as ${esc(S.user.email)}. Changing it signs you out everywhere.</p></div>
      <div><div class="field-row"><div class="field"><label class="label" for="s-cur">Current password</label><input class="input" id="s-cur" type="password" autocomplete="current-password" data-form="pw" name="current"></div>
        <div class="field"><label class="label" for="s-new">New password</label><input class="input" id="s-new" type="password" autocomplete="new-password" data-form="pw" name="next" placeholder="12+ characters"></div></div>
        <div style="margin-top:14px">${btn('change-password', 'Update password')}</div></div></section>
  </div></div></div>`;
}

function checkBlock(provider, ready) {
  const results = ui.checks[provider];
  const mark = ok => ok === true ? '<span class="check-mark ok">✓</span>' : ok === false ? '<span class="check-mark bad">✕</span>' : '<span class="check-mark">?</span>';
  return `<div class="check-block">${btn('check-oauth', 'Check connection', {ico: 'refresh', cls: 'sm', attrs: `data-v="${provider}"`, disabled: !ready, title: ready ? '' : 'Save the keys first'})}
    ${results ? `<div class="check-list">${results.map(r => `<div class="check-row">${mark(r.ok)}<div><b>${esc(r.label)}</b><span>${esc(r.detail)}</span></div></div>`).join('')}</div>` : ''}</div>`;
}

// ------------------------------------------------------------------ people (admin)

function people() {
  const members = S.people.filter(x => x.role === 'member');
  const date = t => new Date(t).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
  return header('People', 'Invite people to connect their inboxes') + `<div class="page narrow"><div class="stack">
    <div class="callout">${icon('key')}<div><b>Member accounts can only connect, manage and disconnect their own Gmail or Outlook inboxes.</b> They can’t see emails, domains, results or settings.
      While your Google app is in Testing mode, add each person’s Gmail address as a test user (Google Auth Platform → Audience), or Google will block their sign-in.</div></div>
    <div class="card"><div class="card-head"><h2>Invite someone</h2><span class="sub">The link works once and expires after 7 days.</span></div>
      <div class="card-body"><div class="field-row"><div class="field"><label class="label" for="inv-name">Name</label><input class="input" id="inv-name" data-form="invite" name="name" value="${esc(formVal('invite', 'name'))}" placeholder="Alex" maxlength="100"></div>
        <div class="field"><label class="label" for="inv-email">Email <span class="faint">(optional, locks the invite to it)</span></label><input class="input" id="inv-email" type="email" data-form="invite" name="email" value="${esc(formVal('invite', 'email'))}" placeholder="alex@gmail.com"></div></div>
        ${ui.inviteUrl ? `<div class="field" style="margin-top:14px"><span class="label">Invite link</span><div class="copy"><code>${esc(ui.inviteUrl)}</code>${btn('copy', '', {ico: 'copy', cls: 'sm icon ghost', attrs: `data-v="${esc(ui.inviteUrl)}"`, title: 'Copy'})}</div><span class="hint">Send this link to them yourself. Anyone with it can create a member account until it’s used.</span></div>` : ''}</div>
      <div class="card-foot"><div class="right">${btn('create-invite', 'Create invite link', {cls: 'primary', ico: 'plus'})}</div></div></div>
    ${S.invites.length ? `<div class="card"><div class="card-head"><h2>Waiting to join</h2></div><table class="table"><tbody>${S.invites.map(i => `<tr><td><b>${esc(i.name || 'Unnamed')}</b><div class="faint small">${esc(i.email || 'Any email')}</div></td><td class="small muted">Expires ${esc(date(i.expires_at))}</td><td style="text-align:right">${btn('show-invite', '', {ico: 'link', cls: 'sm icon ghost', id: i.id, title: 'Show invite link'})}${btn('revoke-invite', 'Revoke', {cls: 'sm ghost danger', id: i.id})}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="card"><div class="card-head"><h2>Accounts</h2><span class="sub">${plural(members.length, 'member')}</span></div>
      <table class="table"><thead><tr><th>Person</th><th>Role</th><th>Inboxes</th><th class="hide-xs">Joined</th><th></th></tr></thead><tbody>${S.people.map(x => `<tr>
        <td><b>${esc(x.name || x.email.split('@')[0])}</b><div class="faint small">${esc(x.email)}</div></td>
        <td><span class="pill ${x.role === 'admin' ? 's-ready' : 's-draft'}">${x.role === 'admin' ? 'Admin' : 'Member'}</span></td>
        <td class="mono">${x.inboxes}</td><td class="small muted hide-xs">${esc(date(x.created_at))}</td>
        <td style="text-align:right">${x.role === 'member' ? btn('remove-person', 'Remove', {cls: 'sm ghost danger', id: String(x.id)}) : ''}</td></tr>`).join('')}</tbody></table></div>
  </div></div>`;
}

function inviteDialog(invite, url) {
  const who = invite.name || invite.email || 'this person';
  const expires = new Date(invite.expires_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  openDialog(`<form method="dialog">
    <div class="dlg-head"><h2>Invite link for ${esc(who)}</h2><p>${url ? `Works once, until ${esc(expires)}.` : 'This invite was created before links were saved, so its link can’t be shown again. Create a new link to share instead.'}</p></div>
    ${url ? `<div class="dlg-body"><div class="copy"><code id="inv-link">${esc(url)}</code></div></div>` : ''}
    <div class="dlg-foot"><button type="button" class="btn ghost" id="inv-renew" style="margin-right:auto">Create a new link</button>
      <button type="button" class="btn" data-close>Close</button>${url ? '<button type="button" class="btn primary" id="inv-copy">Copy link</button>' : ''}</div></form>`, d => {
    const copy = async link => { try { await navigator.clipboard.writeText(link); toast('Invite link copied'); } catch (e) { toast('Copy failed. Select the link instead', 'err'); } };
    if (url) $('#inv-copy', d).onclick = () => copy(url);
    $('#inv-renew', d).onclick = async () => {
      if (url && !confirm('Create a new link? The current link for ' + who + ' will stop working.')) return;
      try {
        const r = await api('renew_invite', {id: invite.id});
        closeDialog('ok');
        await load();
        inviteDialog({...invite, id: r.id, expires_at: new Date(Date.now() + r.days * 86400000).toISOString()}, r.url);
      } catch (err) { toast(err.message, 'err'); }
    };
  });
}

// Someone who's already signed in opened an invite link: let them choose instead of silently ignoring it.
function renderJoinSignedIn(user, token) {
  root.innerHTML = `<div class="auth"><div class="auth-card"><div class="logo">${LOGO}</div>
    <h1>You’re already signed in</h1><p>You’re signed in as <b>${esc(user.email)}</b>. This invite link creates a separate account. To add more inboxes, keep using your current account.</p>
    <form id="auth-form"><button type="button" class="btn primary" id="j-stay">Continue as ${esc(user.email)}</button>
      <button type="button" class="btn" id="j-switch">Sign out and use this invite</button></form></div></div>`;
  $('#j-stay').onclick = () => { history.replaceState(null, '', location.pathname); start(user); };
  $('#j-switch').onclick = async () => { try { await api('logout'); } finally { S = null; renderJoin(token); } };
}

// ------------------------------------------------------------------ member view

function memberView() {
  const name = (S.user.name || S.user.email.split('@')[0]);
  const from = S.sender ? S.sender.email : 'the test sender';
  const row = s => {
    const kind = seedKind(s);
    const actions = [];
    if (kind === 'google' && !s.gmail_send_enabled) actions.push(btn('allow', 'Allow replies', {cls: 'sm', id: s.id}));
    if (S.sender && kind !== 'imap' && s.filter_never_spam !== true) actions.push(btn('filter-spam', kind === 'microsoft' ? 'Always Focused' : 'Never send to Spam', {cls: 'sm ghost', id: s.id}));
    actions.push(btn('remove-seed', 'Disconnect', {cls: 'sm ghost danger', id: s.id}));
    return `<div class="member-inbox"><div class="who"><b>${esc(s.email)}</b><span>${esc(PROVIDERS[s.provider] || s.provider)} · connected ${ago(s.created_at, true)}</span></div>
      <div class="pills">${kind === 'google' && !s.gmail_send_enabled ? '<span class="pill s-tab">Read only</span>' : '<span class="pill s-inbox">Connected</span>'}${s.filter_never_spam ? `<span class="pill s-inbox">${kind === 'microsoft' ? 'Always Focused' : 'Never spam'}</span>` : ''}</div>
      <div class="row-actions">${actions.join('')}</div></div>`;
  };
  return `<div class="member-page">
    <header class="member-top"><span class="ws-logo">${LOGO}</span><b>Mail Mantis</b><span class="grow"></span><span class="muted small hide-sm">${esc(S.user.email)}</span>${btn('logout', 'Sign out', {cls: 'sm ghost', ico: 'logout'})}</header>
    <main class="member-main"><h1>Hi ${esc(name)}</h1><p class="lead">Connect the inboxes you’re happy to lend for email tests from <b>${esc(S.sender ? S.sender.domain : 'our domain')}</b>. Thank you!</p>
      <div class="member-connect">${btn('member-connect', 'Connect Gmail', {cls: 'primary', attrs: 'data-v="google"', disabled: !S.google.ready, title: S.google.ready ? '' : 'Not set up yet'})}${btn('member-connect', 'Connect Outlook', {cls: 'primary', attrs: 'data-v="microsoft"', disabled: !S.microsoft.ready, title: S.microsoft.ready ? '' : 'Not set up yet'})}</div>
      <div class="card"><div class="card-head"><h2>Your inboxes</h2><span class="sub">${plural(S.seeds.length, 'inbox', 'inboxes')}</span></div>${S.seeds.length ? S.seeds.map(row).join('') : empty('mail', 'No inboxes connected yet', 'Use the buttons above. You’ll choose the account on Google’s or Microsoft’s own sign-in page.')}</div>
      <div class="card"><div class="card-head"><h2>What this access is used for</h2></div><div class="card-body"><ul class="plain-list">
        <li>Finding the test emails sent from <b>${esc(from)}</b> to see whether they landed in your inbox or spam. Other mail isn’t read or stored.</li>
        <li>Sending a short reply to a test email, or moving one out of spam, only when the person running the tests chooses to.</li>
        <li>You can disconnect here at any time, or remove access in your Google or Microsoft account’s security settings.</li></ul></div></div>
      <details class="card member-password"><summary>Change password</summary><div class="card-body"><div class="field-row"><div class="field"><label class="label" for="s-cur">Current password</label><input class="input" id="s-cur" type="password" autocomplete="current-password" data-form="pw" name="current"></div>
        <div class="field"><label class="label" for="s-new">New password</label><input class="input" id="s-new" type="password" autocomplete="new-password" data-form="pw" name="next" placeholder="12+ characters"></div></div>
        <div style="margin-top:14px">${btn('change-password', 'Update password')}</div></div></details>
    </main></div>`;
}

// ------------------------------------------------------------------ join (invite link)

async function renderJoin(token) {
  let invite;
  try { invite = await api('invite_info', {token}); }
  catch (e) { ui.authMode = 'login'; renderAuth(e.message); history.replaceState(null, '', location.pathname); return; }
  root.innerHTML = `<div class="auth"><div class="auth-card"><div class="logo">${LOGO}</div>
    <h1>Join Mail Mantis</h1><p>Create your account, then connect the inboxes you’d like to lend for email tests.</p>
    <form id="auth-form">
      <div class="field"><label class="label" for="j-name">Your name</label><input class="input" id="j-name" value="${esc(invite.name)}" autocomplete="name" maxlength="100"></div>
      <div class="field"><label class="label" for="j-email">Email</label><input class="input" id="j-email" type="email" required autocomplete="username" value="${esc(invite.email)}" ${invite.email ? 'readonly' : ''}></div>
      <div class="field"><label class="label" for="j-pass">Create a password</label><input class="input" id="j-pass" type="password" required minlength="12" autocomplete="new-password" placeholder="12+ characters"></div>
      <button class="btn primary">Create account</button>
      <p class="form-error" id="auth-error"></p>
    </form></div></div>`;
  $(invite.email ? '#j-pass' : '#j-name').focus();
  $('#auth-form').onsubmit = async e => {
    e.preventDefault();
    const button = $('#auth-form .btn');
    button.disabled = true;
    try {
      const d = await api('accept_invite', {token, name: $('#j-name').value, email: $('#j-email').value, password: $('#j-pass').value});
      history.replaceState(null, '', location.pathname);
      await start(d.user);
    } catch (err) { $('#auth-error').textContent = err.message; button.disabled = false; }
  };
}

// ------------------------------------------------------------------ auth view

function renderAuth(message = '') {
  stopPolling();
  const setup = ui.authMode === 'setup';
  root.innerHTML = `<div class="auth"><div class="auth-card"><div class="logo">${LOGO}</div>
    <h1>${setup ? 'Create your admin login' : 'Sign in to Mail Mantis'}</h1><p>${setup ? 'Use the one-time setup key from your server.' : 'Your private deliverability workspace.'}</p>
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
  if (!S || !S.drafts || (silent && !sentEmails().some(waiting))) { schedulePolling(); return; }
  try {
    const r = await api('check_placement');
    await load(!silent);
    if (!silent) toast(r.results.length ? plural(r.results.length, 'email') + ' checked' + (r.failures ? `, ${r.failures} failed` : '') : 'Nothing is waiting for a result');
  } catch (e) { if (!silent) toast(e.message, 'err'); }
  schedulePolling();
}
function schedulePolling() {
  stopPolling();
  if (S && S.drafts && sentEmails().some(d => waiting(d) && Date.now() - ms(d.sent_at) < 20 * 60000))
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

function senderPayload(id) {
  const sd = S.senders.find(x => x.id === id) || {};
  const key = 'sender:' + (id || 'new');
  const f = name => formVal(key, name, name === 'smtp_port' ? (sd.smtp_port || 587) : (sd[name] || ''));
  return {id: id || '', from_name: f('from_name'), email: f('email'), domain: f('domain'), smtp_host: f('smtp_host'),
          smtp_port: Number(f('smtp_port')), smtp_username: f('smtp_username'), password: f('password')};
}
function senderMessage(text, ok) { const m = $('#sender-msg'); if (m) { m.textContent = text; m.style.color = ok ? 'var(--inbox)' : 'var(--spam)'; } }

const ACTIONS = {
  menu() { ui.sidebarOpen = !ui.sidebarOpen; $('.sidebar').classList.toggle('open', ui.sidebarOpen); },
  async logout() { try { await api('logout'); } finally { S = null; ui.authMode = 'login'; renderAuth(); } },
  theme() { const order = ['system', 'light', 'dark']; ACTIONS['set-theme'](null, order[(order.indexOf(document.documentElement.dataset.theme || 'system') + 1) % 3]); },
  'set-theme'(el, v = el.dataset.v) {
    if (v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    try { localStorage.setItem('mm-theme', v); } catch (e) { /* storage blocked */ }
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
      toast('Inbox reports: ' + r.placement + (r.tab ? ' · ' + r.tab : ''));
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
    const from = S.sender ? S.sender.email : 'your sender';
    if (seedKind(s) === 'microsoft') {
      if (!await confirmBox({title: 'Always Focused?', text: `Adds a Focused Inbox override in ${s.email} so mail from ${from} always lands in Focused rather than Other.\n\nOutlook’s junk filtering can’t be switched off through Microsoft Graph, so this doesn’t stop Junk. Use Not spam on an email for that.`, ok: 'Continue with Microsoft'})) return;
      return oauthFlow('microsoft', 'filter', s.id);
    }
    if (!await confirmBox({title: 'Never send to Spam?', text: `Creates a Gmail filter in ${s.email} so mail from ${from} skips Spam.\n\nIt only affects future emails, and placement results for this inbox won’t show Gmail’s natural decision.`, ok: 'Continue with Google'})) return;
    await googleFlow('filter', s.id);
  },
  async 'filter-important'(el) {
    const s = S.seeds.find(x => x.id === el.dataset.id);
    const ms_ = seedKind(s) === 'microsoft';
    if (!await confirmBox({title: 'Mark as important?', text: `Creates ${ms_ ? 'an inbox rule' : 'a Gmail filter'} in ${s.email} that marks mail from ${S.sender ? S.sender.email : 'your sender'} as important. It only affects future emails.`, ok: ms_ ? 'Continue with Microsoft' : 'Continue with Google'})) return;
    if (ms_) return oauthFlow('microsoft', 'filter_important', s.id);
    await googleFlow('filter_important', s.id);
  },
  async 'message-action'(el) {
    await withBusy(el, async () => {
      const r = await api('message_action', {id: el.dataset.id, op: el.dataset.v});
      await load();
      toast(r.message);
    });
  },
  async 'check-oauth'(el) {
    await withBusy(el, async () => {
      const r = await api('check_oauth', {provider: el.dataset.v});
      ui.checks[el.dataset.v] = r.checks;
      render(true);
    });
  },
  async 'create-invite'(el) {
    await withBusy(el, async () => {
      const r = await api('create_invite', {name: formVal('invite', 'name'), email: formVal('invite', 'email')});
      delete ui.forms.invite;
      ui.inviteUrl = r.url;
      await load();
      try { await navigator.clipboard.writeText(r.url); toast('Invite link created and copied'); } catch (e) { toast('Invite link created'); }
    });
  },
  async 'show-invite'(el) {
    const invite = S.invites.find(x => x.id === el.dataset.id);
    const r = await api('invite_link', {id: invite.id});
    inviteDialog(invite, r.url);
  },
  async 'revoke-invite'(el) {
    if (!await confirmBox({title: 'Revoke this invite?', text: 'The link stops working straight away.', ok: 'Revoke', danger: true})) return;
    await api('revoke_invite', {id: el.dataset.id});
    await load();
  },
  async 'remove-person'(el) {
    const p = S.people.find(x => String(x.id) === el.dataset.id);
    if (!await confirmBox({title: 'Remove ' + (p.name || p.email) + '?', text: `Their account is deleted and the ${plural(p.inboxes, 'inbox', 'inboxes')} they connected are disconnected, including the stored sign-in tokens. Sent email history is kept.`, ok: 'Remove', danger: true})) return;
    const r = await api('remove_person', {id: p.id});
    await load();
    toast(r.message);
  },
  async 'member-connect'(el) { await oauthFlow(el.dataset.v, 'connect', '', S.user.name || ''); },
  async 'save-microsoft'(el) {
    await withBusy(el, async () => {
      await api('save_microsoft', {client_id: formVal('microsoft', 'client_id', S.microsoft.client_id), client_secret: formVal('microsoft', 'client_secret')});
      delete ui.forms.microsoft;
      await load();
      toast('Microsoft sign-in saved');
    });
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
    if (!await confirmBox({title: (S.role === 'member' ? 'Disconnect ' : 'Remove ') + s.email + '?', text: S.role === 'member' ? 'Mail Mantis deletes its access to this inbox. You can connect it again later.' : 'Sent email history is kept. You can connect it again later.', ok: S.role === 'member' ? 'Disconnect' : 'Remove', danger: true})) return;
    await api('remove_seed', {id: s.id});
    await load();
  },
  async 'check-filters'(el) {
    await withBusy(el, async () => {
      const r = await api('check_filters');
      const failed = Object.values(r.results).filter(x => x.error).length;
      await load();
      toast(failed ? plural(failed, 'inbox', 'inboxes') + ' could not be read. Reconnect them.' : 'Filters read from the inboxes', failed ? 'err' : 'ok');
    });
  },
  connect() { connectDialog(); },

  async 'test-sender'(el) {
    await withBusy(el, async () => { const r = await api('test_sender', senderPayload(el.dataset.id)); senderMessage(r.message, true); })
      .catch(e => senderMessage(e.message, false));
  },
  async 'save-sender'(el) {
    const id = el.dataset.id;
    await withBusy(el, async () => {
      const r = await api('save_sender', senderPayload(id));
      delete ui.forms['sender:' + (id || 'new')];
      await load();
      toast(r.message);
      if (!id) go('#/domains/' + r.id);
    }).catch(e => senderMessage(e.message, false));
  },
  'switch-domain'() { switchDialog(); },
  async activate(el) {
    const sd = S.senders.find(x => x.id === el.dataset.id);
    if (!await confirmBox({title: 'Warm up ' + sd.domain + '?', text: `${sd.domain} becomes the active domain. New drafts and sends use ${sd.email}, and the dashboard shows its results.${S.sender ? ' ' + S.sender.domain + ' keeps its history and can be made active again later.' : ''}`, ok: 'Make active'})) return;
    const r = await api('set_active_sender', {id: sd.id});
    ui.sel = null;
    await load();
    toast(r.message);
  },
  async 'remove-domain'(el) {
    const sd = S.senders.find(x => x.id === el.dataset.id);
    if (!await confirmBox({title: 'Remove ' + sd.domain + '?', text: 'Its SMTP details and brief are deleted. Emails already sent stay in the history.', ok: 'Remove', danger: true})) return;
    await api('delete_sender', {id: sd.id});
    await load();
    go('#/domains');
  },
  async 'read-site'(el) {
    const sd = S.senders.find(x => x.id === el.dataset.id);
    if ((formVal('brief:' + sd.id, 'summary', sd.brief || '')).trim() && !await confirmBox({title: 'Replace the brief?', text: 'Gemini will read ' + sd.domain + ' and replace the text in the box. Nothing is saved until you choose Save brief.', ok: 'Read website'})) return;
    await withBusy(el, async () => {
      const r = await api('analyze_website', {id: sd.id});
      ui.forms['brief:' + sd.id] = {summary: r.summary};
      ui.pendingSources[sd.id] = r.sources;
      render(true);
      toast(r.sources.length ? 'Summary ready. Review and correct it, then save.' : 'Gemini could not confirm which pages it read. Check the summary carefully.');
    });
  },
  async 'save-brief'(el) {
    const sd = S.senders.find(x => x.id === el.dataset.id);
    await withBusy(el, async () => {
      const r = await api('save_website_brief', {id: sd.id, summary: formVal('brief:' + sd.id, 'summary', sd.brief || ''), sources: ui.pendingSources[sd.id] || sd.brief_sources || []});
      delete ui.forms['brief:' + sd.id];
      delete ui.pendingSources[sd.id];
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

async function oauthFlow(provider, purpose, seedId, name = '') {
  const d = await api(provider === 'microsoft' ? 'microsoft_oauth_start' : 'google_oauth_start', {purpose, seed_id: seedId, name});
  location.assign(d.url);
}

// Pick a provider, then sign in with Google or Microsoft, or enter IMAP details with an app password.
async function connectDialog() {
  const options = [
    ['google', 'Gmail or Google Workspace', 'Sign in with Google', S.google.ready ? '' : 'Add the Google OAuth client in Settings first'],
    ['microsoft', 'Outlook or Microsoft 365', 'Sign in with Microsoft', S.microsoft.ready ? '' : 'Add the Microsoft app registration in Settings first'],
    ...['yahoo', 'icloud', 'aol', 'imap'].map(k => [k, S.imap_presets[k].label, k === 'imap' ? 'Any provider, with IMAP and SMTP' : 'App password over IMAP', ''])
  ];
  const picked = await openDialog(`<form method="dialog">
    <div class="dlg-head"><h2>Connect a seed inbox</h2><p>Use an inbox you own. Gmail and Outlook connect with sign-in; other providers use an app password over IMAP.</p></div>
    <div class="dlg-body"><div class="pick">${options.map(([k, label, sub, blocked], i) => `<label${blocked ? ' class="faint" title="' + esc(blocked) + '"' : ''}><input type="radio" class="checkbox" name="provider" value="${k}" ${i === 0 && !blocked ? 'checked' : ''} ${blocked ? 'disabled' : ''}><div>${esc(label)}<span>${esc(blocked || sub)}</span></div></label>`).join('')}</div>
      <div class="field" style="margin-top:14px"><label class="label" for="c-name">First name for greetings <span class="faint">(optional)</span></label><input class="input" id="c-name" placeholder="Jane" maxlength="100"></div></div>
    <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" value="ok">Continue</button></div></form>`);
  if (picked !== 'ok') return;
  const provider = $('input[name=provider]:checked', dialog)?.value;
  const name = $('#c-name', dialog).value;
  if (!provider) return;
  try {
    if (provider === 'google' || provider === 'microsoft') return await oauthFlow(provider, 'connect', '', name);
    await imapDialog(provider, name);
  } catch (err) { toast(err.message, 'err'); }
}

async function imapDialog(provider, name) {
  const preset = S.imap_presets[provider];
  const custom = provider === 'imap';
  openDialog(`<form method="dialog" id="imap-form">
    <div class="dlg-head"><h2>Connect ${esc(preset.label)}</h2><p>${esc(preset.help)} Your normal password won’t work. The app password is encrypted when saved.</p></div>
    <div class="dlg-body">
      <div class="field"><label class="label" for="i-email">Email address</label><input class="input" id="i-email" type="email" required autocomplete="off"></div>
      <div class="field"><label class="label" for="i-pass">App password</label><input class="input" id="i-pass" type="password" required autocomplete="new-password"></div>
      ${custom ? `<div class="field-row"><div class="field"><label class="label" for="i-ih">IMAP server</label><input class="input" id="i-ih" placeholder="imap.example.com"></div><div class="field"><label class="label" for="i-ip">IMAP port</label><input class="input" id="i-ip" value="993" inputmode="numeric"></div></div>
      <div class="field-row"><div class="field"><label class="label" for="i-sh">SMTP server</label><input class="input" id="i-sh" placeholder="smtp.example.com"></div><div class="field"><label class="label" for="i-sp">SMTP port</label><input class="input" id="i-sp" value="587" inputmode="numeric"></div></div>
      <div class="field"><label class="label" for="i-login">Login <span class="faint">(if not the email address)</span></label><input class="input" id="i-login" autocomplete="off"></div>`
      : `<p class="hint" style="margin:0">Servers: <span class="mono">${esc(preset.imap_host)}</span> and <span class="mono">${esc(preset.smtp_host)}</span></p>`}
      <p class="form-error" id="i-error" style="text-align:left"></p>
    </div>
    <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="i-go">Test and connect</button></div></form>`, d => {
    $('#i-email', d).focus();
    $('#i-go', d).onclick = async e => {
      const b = e.currentTarget;
      b.disabled = true;
      b.innerHTML = '<span class="spin"></span><span>Testing…</span>';
      $('#i-error', d).textContent = '';
      const v = id => ($('#' + id, d) || {}).value || '';
      try {
        const r = await api('connect_imap', {provider, name, email: v('i-email'), password: v('i-pass'), login: v('i-login'),
          imap_host: v('i-ih'), imap_port: v('i-ip'), smtp_host: v('i-sh'), smtp_port: v('i-sp')});
        closeDialog('ok');
        await load();
        toast(r.message);
      } catch (err) {
        $('#i-error', d).textContent = err.message;
        b.disabled = false;
        b.textContent = 'Test and connect';
      }
    };
  });
}

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
  if (el.tagName === 'BUTTON' || el.getAttribute('href') === '#') e.preventDefault();
  try { await ACTIONS[el.dataset.act](el); } catch (err) { toast(err.message, 'err'); }
});

root.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.form) {
    (ui.forms[el.dataset.form] ||= {})[el.name] = el.value;
    if (el.dataset.form.startsWith('brief:')) { const c = root.querySelector(`[data-count="${CSS.escape(el.dataset.form.slice(6))}"]`); if (c) c.textContent = el.value.length + ' / 6000'; }
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
  if (!S || dialog.open || S.role === 'member') return;
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
  if (!S.sender) { toast('Add a sender domain first', 'err'); go('#/domains/new'); return; }
  if (!enabled.length) { toast('Connect a seed inbox first', 'err'); go('#/seeds'); return; }
  const lastResult = email => { const d = sentEmails().filter(x => x.seed_email === email).sort((a, b) => ms(b.sent_at) - ms(a.sent_at))[0]; return d ? pill(d) : ''; };
  openDialog(`<form method="dialog" id="compose">
    <div class="dlg-head"><h2>Write emails from ${esc(S.sender.domain)}</h2><p>Gemini writes a different, ordinary email for each inbox you pick, using the ${esc(S.sender.domain)} brief. Nothing is sent until you review it and press Send.</p></div>
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

async function switchDialog() {
  if (!S.senders.length) { go('#/domains/new'); return; }
  const result = await openDialog(`<form method="dialog">
    <div class="dlg-head"><h2>Active domain</h2><p>Only one domain is warmed at a time. The active domain is used for new drafts and sends, and the dashboard shows its results.</p></div>
    <div class="dlg-body"><div class="pick">${S.senders.map(x => `<label><input type="radio" class="checkbox" name="sender" value="${esc(x.id)}" ${x.active ? 'checked' : ''}><span class="avatar sm" style="--h:${hue(x.domain)}">${esc(x.domain.charAt(0).toUpperCase())}</span><div>${esc(x.domain)}<span>${esc(x.email)}</span></div>${x.active ? '<span class="pill s-inbox">Active</span>' : ''}</label>`).join('')}</div>
      <p style="margin:12px 0 0"><a class="link" href="#/domains/new" data-close>Add another domain</a></p></div>
    <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" value="ok">Make active</button></div></form>`);
  if (result !== 'ok') return;
  const id = $('input[name=sender]:checked', dialog)?.value;
  if (!id || (S.sender && id === S.sender.id)) return;
  try {
    const r = await api('set_active_sender', {id});
    ui.sel = null;
    await load();
    toast(r.message);
  } catch (err) { toast(err.message, 'err'); }
}

// ------------------------------------------------------------------ start

const GOOGLE_RESULT = {connected: 'Inbox connected', already_connected: 'already', send_enabled: 'Sending replies is now allowed', filter_added: 'Filter saved in the inbox', filter_exists: 'That filter was already in place'};

async function start(user) {
  const ok = await load();
  if (!ok) return;
  S.user = user || S.user;
  const params = new URLSearchParams(location.search);
  const result = params.get('google');
  if (result) {
    history.replaceState(null, '', location.pathname + (S.role === 'member' ? '' : '#/seeds'));
    if (result === 'already_connected') toast((params.get('reason') || 'That inbox') + ' was already connected. To add another inbox, pick a different account on the sign-in screen.', 'err');
    else toast(GOOGLE_RESULT[result] || ('Connection failed' + (params.get('reason') ? ': ' + params.get('reason') : '')), GOOGLE_RESULT[result] ? 'ok' : 'err');
  }
  route();
  refreshPlacements(true);
}

(async () => {
  const join = (location.hash.match(/^#\/join\/([\w-]+)/) || [])[1];
  try {
    const status = await api('status');
    if (status.user) { if (join) { renderJoinSignedIn(status.user, join); return; } await start(status.user); return; }
    if (join) { await renderJoin(join); return; }
    ui.authMode = status.setup_required ? 'setup' : 'login';
  } catch (e) {
    ui.authMode = 'login';
    renderAuth(e.message);
    return;
  }
  renderAuth();
})();
