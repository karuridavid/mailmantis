// Set this to your Buy Me a Coffee page (e.g. "https://buymeacoffee.com/yourname") to show the buttons.
const COFFEE_URL = '';
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
