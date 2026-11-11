// =============================================================
//  Shared UI helpers: navigation, toast, status styling, escaping.
// =============================================================
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const PAGES = [
  { id: 'home',       label: 'Home',       href: 'index.html',      icon: 'ri-home-5-line' },
  { id: 'dashboard',  label: 'Capacity',   href: 'dashboard.html',  icon: 'ri-dashboard-line' },
  { id: 'patients',   label: 'Patients',   href: 'patients.html',   icon: 'ri-team-line' },
  { id: 'admissions', label: 'Admissions', href: 'admissions.html', icon: 'ri-file-list-3-line' },
];

export function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function mountChrome(active) {
  const main = $('main');
  if (main && !main.id) main.id = 'main-content';

  const skipLink = document.createElement('a');
  skipLink.href = '#main-content';
  skipLink.className = 'skip-link';
  skipLink.textContent = 'Skip to main content';
  document.body.prepend(skipLink);

  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <nav aria-label="Primary" class="site-nav">
      <a href="index.html" class="brand" aria-label="MediCap home">
        <span class="brand-mark" aria-hidden="true">+</span>
        <span>Medi<span class="brand-word-accent">Cap</span></span>
      </a>
      <ul class="nav-list">
        ${PAGES.map(page => `
          <li><a href="${page.href}" ${page.id === active ? 'aria-current="page"' : ''} class="nav-link ${page.id === active ? 'active' : ''}">
            ${page.label}
          </a></li>`).join('')}
      </ul>
      <button id="nav-menu-btn" class="menu-button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="nav-mobile">
        <i class="ri-menu-line" aria-hidden="true"></i>
      </button>
    </nav>
    <ul id="nav-mobile" class="mobile-nav hidden">
      ${PAGES.map(page => `
        <li><a href="${page.href}" ${page.id === active ? 'aria-current="page"' : ''}>
          <i class="${page.icon}" aria-hidden="true"></i> ${page.label}
        </a></li>`).join('')}
    </ul>`;
  document.body.insertBefore(header, main || document.body.firstChild);

  const button = $('#nav-menu-btn');
  const mobileNav = $('#nav-mobile');
  const closeMobileNav = (restoreFocus = false) => {
    button?.setAttribute('aria-expanded', 'false');
    button?.setAttribute('aria-label', 'Open navigation menu');
    mobileNav?.classList.add('hidden');
    if (restoreFocus) button?.focus();
  };

  button?.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      closeMobileNav();
    } else {
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-label', 'Close navigation menu');
      mobileNav?.classList.remove('hidden');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && button?.getAttribute('aria-expanded') === 'true') {
      closeMobileNav(true);
    }
  });

  const mobileBreakpoint = window.matchMedia('(max-width: 640px)');
  const syncMenuAtBreakpoint = event => {
    if (!event.matches) closeMobileNav();
  };
  if (mobileBreakpoint.addEventListener) mobileBreakpoint.addEventListener('change', syncMenuAtBreakpoint);
  else mobileBreakpoint.addListener(syncMenuAtBreakpoint);

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  toast.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] hidden px-5 py-3 text-sm font-medium';
  document.body.appendChild(toast);
}

let toastTimer;
export function toast(message, kind = 'ok') {
  const element = $('#toast');
  if (!element) return;
  element.setAttribute('role', kind === 'ok' ? 'status' : 'alert');
  element.textContent = message;
  element.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 text-sm font-medium';
  element.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.add('hidden'), 2600);
}

export function statusStyle(status, beds, occupied = 0) {
  if (status === 'Maintenance') return { card: 'room-card--maintenance', badge: 'status-badge--maintenance', bar: 'gauge-fill--neutral', label: 'Maintenance', icon: 'ri-tools-line' };
  if (status === 'Full' || beds <= 0) return { card: 'room-card--full', badge: 'status-badge--full', bar: 'gauge-fill--red', label: 'Full', icon: 'ri-close-circle-line' };
  if (beds === 1 && occupied > 0) return { card: 'room-card--warning', badge: 'status-badge--warning', bar: 'gauge-fill--amber', label: 'Near full', icon: 'ri-alert-line' };
  return { card: 'room-card--available', badge: 'status-badge--available', bar: 'gauge-fill--green', label: 'Available', icon: 'ri-checkbox-circle-line' };
}

export const UI = { mountChrome, toast, statusStyle, escapeHTML, $, $$ };
