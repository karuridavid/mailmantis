// Set this to your Buy Me a Coffee page (e.g. "https://buymeacoffee.com/yourname") to show the buttons.
const COFFEE_URL = 'https://buymeacoffee.com/mailmantis';
if (COFFEE_URL) document.querySelectorAll('[data-coffee]').forEach(a => { a.href = COFFEE_URL; a.target = '_blank'; a.rel = 'noopener'; a.hidden = false; });

// Sticky nav border on scroll and copy buttons for commands.
const nav = document.querySelector('.nav');
const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
document.addEventListener('click', async e => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;
  const source = btn.dataset.copy || btn.closest('pre, .cmd')?.querySelector('code')?.innerText || '';
  try {
    await navigator.clipboard.writeText(source.replace(/^\$ /gm, '').trim());
    btn.setAttribute('aria-label', 'Copied');
    btn.innerHTML = '<svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
    setTimeout(() => { btn.innerHTML = COPY; btn.setAttribute('aria-label', 'Copy'); }, 1600);
  } catch (err) { /* clipboard unavailable */ }
});
const COPY = '<svg class="i" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
document.querySelectorAll('.copy-btn:empty').forEach(b => { b.innerHTML = COPY; b.setAttribute('aria-label', 'Copy'); b.type = 'button'; });

// Theme switch: follows the system until the visitor picks light or dark.
const ICONS = {
  system: '<svg class="i" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  light: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  dark: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'
};
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const choice = document.documentElement.dataset.theme || 'system';
  const dark = choice === 'dark' || (choice === 'system' && darkQuery.matches);
  document.querySelectorAll('img.themed').forEach(img => {
    img.dataset.light = img.dataset.light || img.getAttribute('src');
    const want = dark ? img.dataset.dark : img.dataset.light;
    if (img.getAttribute('src') !== want) img.setAttribute('src', want);
  });
  document.querySelectorAll('[data-theme-toggle]').forEach(b => { b.innerHTML = ICONS[choice]; b.title = 'Theme: ' + choice; });
}
document.addEventListener('click', e => {
  if (!e.target.closest('[data-theme-toggle]')) return;
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(document.documentElement.dataset.theme || 'system') + 1) % 3];
  if (next === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
  try { localStorage.setItem('mm-site-theme', next); } catch (err) { /* storage blocked */ }
  applyTheme();
});
darkQuery.addEventListener('change', applyTheme);
applyTheme();
