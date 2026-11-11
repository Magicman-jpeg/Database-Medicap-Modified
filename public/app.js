// =============================================================
//  MediCap dashboard — connected client logic (Fetch API)
//  Pages: Dashboard, Patients, Admissions
// =============================================================
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return str; }
}

const api = {
  async get(url)         { return handle(await fetch(url)); },
  async post(url, body)  { return handle(await fetch(url, { method: 'POST', headers: json(), body: JSON.stringify(body) })); },
  async patch(url, body) { return handle(await fetch(url, { method: 'PATCH', headers: json(), body: body ? JSON.stringify(body) : undefined })); },
};
const json = () => ({ 'Content-Type': 'application/json' });
async function handle(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

// ============================================================
//  ROUTING
// ============================================================
const PAGES = ['dashboard', 'patients', 'admissions'];
let currentPage = 'dashboard';

function getPageFromHash() {
  const hash = location.hash.replace('#', '');
  return PAGES.includes(hash) ? hash : 'dashboard';
}

function navigateTo(page) {
  currentPage = page;
  PAGES.forEach(p => {
    const el = $(`#page-${p}`);
    if (el) el.classList.toggle('hidden', p !== page);
  });
  // Sidebar links (desktop + mobile)
  $$('.sidebar__link, .mobile-drawer .sidebar__link').forEach(link => {
    const active = link.dataset.page === page;
    link.classList.toggle('sidebar__link--active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  // Load page data
  if (page === 'dashboard') refreshRooms();
  if (page === 'patients')   loadPatients();
  if (page === 'admissions') loadAdmissions();
  // Close mobile drawer if open
  closeMobileDrawer();
}

window.addEventListener('hashchange', () => {
  const page = getPageFromHash();
  if (page !== currentPage) navigateTo(page);
});

// ============================================================
//  MOBILE DRAWER
// ============================================================
const mobileDrawer  = $('#mobile-drawer');
const mobileOverlay = $('#mobile-overlay');

function openMobileDrawer() {
  mobileDrawer.classList.remove('hidden');
  mobileOverlay.classList.remove('hidden');
  requestAnimationFrame(() => mobileDrawer.classList.add('open'));
  $('#mobile-menu-btn').setAttribute('aria-expanded', 'true');
  mobileOverlay.setAttribute('aria-hidden', 'false');
}

function closeMobileDrawer() {
  mobileDrawer.classList.remove('open');
  mobileOverlay.classList.add('hidden');
  mobileDrawer.classList.add('hidden');
  $('#mobile-menu-btn').setAttribute('aria-expanded', 'false');
  mobileOverlay.setAttribute('aria-hidden', 'true');
}

$('#mobile-menu-btn').addEventListener('click', openMobileDrawer);
$('#mobile-close-btn').addEventListener('click', closeMobileDrawer);
mobileOverlay.addEventListener('click', closeMobileDrawer);

// Sidebar nav clicks
$$('[data-page]').forEach(link => {
  link.addEventListener('click', e => {
    const page = e.currentTarget.dataset.page;
    location.hash = page;
  });
});

// ============================================================
//  DASHBOARD
// ============================================================
const filters = { type: '', status: '', aircon: false, tv: false, bathroom: false };
let backgroundStale = false;
let allRoomTypes = [];

function statusStyle(status, beds, occupied = 0) {
  if (status === 'Maintenance') return { card: 'room-card--maintenance', badge: 'status-badge--maintenance', bar: 'gauge-fill--neutral', label: 'Maintenance', icon: 'ri-tools-line' };
  if (status === 'Full' || beds <= 0) return { card: 'room-card--full', badge: 'status-badge--full', bar: 'gauge-fill--red', label: 'Full', icon: 'ri-close-circle-line' };
  if (beds === 1 && occupied > 0) return { card: 'room-card--warning', badge: 'status-badge--warning', bar: 'gauge-fill--amber', label: 'Near full', icon: 'ri-alert-line' };
  return { card: 'room-card--available', badge: 'status-badge--available', bar: 'gauge-fill--green', label: 'Available', icon: 'ri-checkbox-circle-line' };
}

function amenityBadges(room) {
  const badges = [];
  if (room.has_aircon)           badges.push('<span class="amenity-badge" title="Aircon"><i class="ri-snowy-line" aria-hidden="true"></i> AC</span>');
  if (room.has_tv)               badges.push('<span class="amenity-badge" title="TV"><i class="ri-tv-line" aria-hidden="true"></i> TV</span>');
  if (room.has_private_bathroom) badges.push('<span class="amenity-badge" title="Private bathroom"><i class="ri-shower-line" aria-hidden="true"></i> Bath</span>');
  if (room.is_isolation_unit)    badges.push('<span class="amenity-badge amenity-badge--iso" title="Isolation unit"><i class="ri-shield-line" aria-hidden="true"></i> Isolation</span>');
  return badges.length ? `<div class="room-amenities">${badges.join('')}</div>` : '';
}

function contagionBadge(patient) {
  return patient.is_contagious
    ? '<span class="contagion-badge" title="Contagious"><i class="ri-shield-cross-line" aria-hidden="true"></i> Contagious</span>'
    : '';
}

function renderStats(rooms) {
  const usableRooms  = rooms.filter(r => r.status !== 'Maintenance');
  const usableBeds   = usableRooms.reduce((s, r) => s + Number(r.bed_capacity), 0);
  const occupied     = usableRooms.reduce((s, r) => s + Number(r.current_occupancy), 0);
  const admittable   = usableRooms.reduce((s, r) => s + Number(r.beds_available), 0);
  const fullRooms    = usableRooms.filter(r => r.status === 'Full').length;
  const isolationRooms = rooms.filter(r => r.is_isolation_unit && r.status !== 'Maintenance');
  const isoAvailable = isolationRooms.filter(r => r.beds_available > 0).length;
  const pct = usableBeds ? Math.round(occupied / usableBeds * 100) : 0;

  const barClass = pct >= 90 ? 'gauge-fill--red' : pct >= 70 ? 'gauge-fill--amber' : 'gauge-fill--green';

  const tiles = [
    { label: 'Usable beds', value: usableBeds, tone: 'metric--blue' },
    { label: 'Occupied',    value: occupied,    tone: '' },
    { label: 'Admittable',  value: admittable,  tone: 'metric--green' },
    { label: 'Full rooms',  value: fullRooms,   tone: fullRooms ? 'metric--red' : '' },
  ];

  $('#stats').innerHTML = tiles.map((tile, i) => `
    <div class="metric ${tile.tone}">
      <div class="metric__top">
        <p class="metric__label">${tile.label}</p>
        <span class="metric__index">0${i + 1}</span>
      </div>
      <p class="metric__value">${tile.value}</p>
    </div>`).join('') + `
    <div class="occupancy-summary">
      <div class="occupancy-summary__meta">
        <span>Occupancy of usable beds</span><span>${pct}%</span>
        <span class="iso-stat">Isolation beds available: ${isoAvailable}</span>
      </div>
      <div class="gauge-track"><div class="gauge-fill ${barClass}" style="width:${pct}%"></div></div>
    </div>`;
}

function renderRooms(rooms) {
  const grid  = $('#rooms');
  const empty = $('#rooms-empty');
  if (!rooms.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = rooms.map(room => {
    const avail = Number(room.beds_available);
    const cap   = Number(room.bed_capacity);
    const occ   = Number(room.current_occupancy);
    const style = statusStyle(room.status, avail, occ);
    const pct   = cap ? Math.round(occ / cap * 100) : 0;

    const patientRows = (room.patients || []).map(p => `
      <li class="patient-row ${p.is_contagious ? 'patient-row--contagious' : ''}">
        <span class="patient-info">
          ${escapeHTML(p.first_name)} ${escapeHTML(p.last_name)}
          ${contagionBadge(p)}
          ${p.medical_case ? `<span class="patient-case">${escapeHTML(p.medical_case)}</span>` : ''}
        </span>
        <button class="button button--secondary" onclick="discharge(${p.admission_id})" title="Discharge patient">
          Discharge
        </button>
      </li>`).join('');

    const canAdmit = room.status !== 'Maintenance' && avail > 0;

    return `
      <article class="room-card ${style.card}" aria-label="Room ${escapeHTML(room.room_number)}">
        <div class="room-card__header">
          <div>
            <h3 class="room-card__title">Room ${escapeHTML(room.room_number)}</h3>
            <p class="room-card__meta">${escapeHTML(room.type_name)}</p>
          </div>
          <span class="status-badge ${style.badge}">
            <i class="${style.icon}" aria-hidden="true"></i> ${style.label}
          </span>
        </div>
        ${amenityBadges(room)}
        <div class="capacity-line">
          <span>Beds occupied</span>
          <span class="capacity-count"><strong>${occ}</strong> / ${cap}</span>
        </div>
        <div class="gauge-track" title="${pct}% occupied">
          <div class="gauge-fill ${style.bar}" style="width:${pct}%"></div>
        </div>
        ${occ > 0 ? `
        <ul class="patient-list" aria-label="Admitted patients">
          ${patientRows}
        </ul>` : `<p class="capacity-note empty-note">No patients currently admitted.</p>`}
        <button class="room-action" ${canAdmit ? '' : 'disabled'}
          onclick="openAdmitModal(${room.room_id})"
          title="${canAdmit ? 'Admit a patient to this room' : 'Room unavailable'}">
          <i class="ri-user-add-line" aria-hidden="true"></i> Admit to this room
        </button>
      </article>`;
  }).join('');
}

async function refreshRooms() {
  try {
    const params = new URLSearchParams();
    if (filters.type)    params.set('type',    filters.type);
    if (filters.status)  params.set('status',  filters.status);
    if (filters.aircon)  params.set('aircon',  '1');
    if (filters.tv)      params.set('tv',      '1');
    if (filters.bathroom) params.set('bathroom', '1');

    const rooms = await api.get('/api/rooms?' + params);

    // Enrich with admitted patients per room
    const admissions = await api.get('/api/admissions?active=true');
    const byRoom = {};
    admissions.forEach(a => {
      (byRoom[a.room_id] = byRoom[a.room_id] || []).push(a);
    });
    rooms.forEach(r => { r.patients = byRoom[r.room_id] || []; });

    renderStats(rooms);
    renderRooms(rooms);
    updateClock();
  } catch (err) {
    showToast('Error loading rooms: ' + err.message, 'error');
  }
}

// ============================================================
//  PATIENTS PAGE
// ============================================================
let allPatients = [];
let ptFilter    = 'all';

async function loadPatients() {
  try {
    allPatients = await api.get('/api/patients');
    renderPatients();
  } catch (err) {
    $('#patients-tbody').innerHTML = `<tr><td colspan="7" class="table-loading">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function renderPatients() {
  const query  = ($('#pt-search').value || '').toLowerCase();
  const tbody  = $('#patients-tbody');
  const empty  = $('#patients-empty');

  let rows = allPatients;
  if (ptFilter !== 'all') {
    rows = rows.filter(p => p.admission_status === ptFilter);
  }
  if (query) {
    rows = rows.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(query) ||
      (p.medical_case || '').toLowerCase().includes(query)
    );
  }

  if (!rows.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = rows.map(p => {
    const statusClass = p.admission_status === 'Admitted' ? 'pt-badge--admitted' : 'pt-badge--discharged';
    const room = p.room_number
      ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:.78rem">${escapeHTML(p.room_number)}</span>
         <span style="color:var(--muted);font-size:.72rem"> ${escapeHTML(p.type_name || '')}</span>`
      : '<span style="color:var(--muted)">—</span>';

    return `<tr>
      <td><span class="pt-id">#${p.patient_id}</span></td>
      <td>
        <span class="pt-name">${escapeHTML(p.first_name)} ${escapeHTML(p.last_name)}</span>
        ${p.is_contagious ? contagionBadge(p) : ''}
      </td>
      <td>${escapeHTML(p.contact_number || '—')}</td>
      <td><span class="pt-case">${escapeHTML(p.medical_case || '—')}</span></td>
      <td>${room}</td>
      <td><span class="pt-badge ${statusClass}">${escapeHTML(p.admission_status)}</span></td>
      <td style="font-size:.78rem;color:var(--muted)">${formatDate(p.admission_date || p.created_at)}</td>
    </tr>`;
  }).join('');
}

// Patient search & filter tabs
$('#pt-search').addEventListener('input', renderPatients);

$$('[data-pt-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    ptFilter = btn.dataset.ptFilter;
    $$('[data-pt-filter]').forEach(b => {
      b.classList.toggle('filter-tab--active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    renderPatients();
  });
});

// ============================================================
//  ADMISSIONS PAGE
// ============================================================
let allAdmissions = [];
let admFilter     = 'all';

async function loadAdmissions() {
  try {
    allAdmissions = await api.get('/api/admissions?active=false');
    renderAdmissions();
  } catch (err) {
    $('#admissions-tbody').innerHTML = `<tr><td colspan="7" class="table-loading">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function renderAdmissions() {
  const tbody = $('#admissions-tbody');
  const empty = $('#admissions-empty');

  let rows = allAdmissions;
  if (admFilter !== 'all') {
    rows = rows.filter(a => a.status === admFilter);
  }

  if (!rows.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = rows.map(a => {
    const statusClass = a.status === 'Active' ? 'adm-badge--active' : 'adm-badge--discharged';
    return `<tr>
      <td><span class="pt-id">#${a.admission_id}</span></td>
      <td>
        <span class="pt-name">${escapeHTML(a.first_name)} ${escapeHTML(a.last_name)}</span>
        ${a.is_contagious ? contagionBadge(a) : ''}
      </td>
      <td style="font-family:'IBM Plex Mono',monospace;font-size:.82rem">${escapeHTML(a.room_number)}</td>
      <td style="color:var(--muted);font-size:.82rem">${escapeHTML(a.type_name)}</td>
      <td style="font-size:.78rem;color:var(--muted)">${formatDate(a.admission_date)}</td>
      <td style="font-size:.78rem;color:var(--muted)">${formatDate(a.discharge_date)}</td>
      <td><span class="adm-badge ${statusClass}">${escapeHTML(a.status)}</span></td>
    </tr>`;
  }).join('');
}

// Admissions filter tabs
$$('[data-adm-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    admFilter = btn.dataset.admFilter;
    $$('[data-adm-filter]').forEach(b => {
      b.classList.toggle('filter-tab--active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    renderAdmissions();
  });
});

// ============================================================
//  DASHBOARD FILTER WIRING
// ============================================================
$('#f-type').addEventListener('change', e => { filters.type = e.target.value; refreshRooms(); });
$('#f-status').addEventListener('change', e => { filters.status = e.target.value; refreshRooms(); });
$('#f-aircon').addEventListener('change', e => { filters.aircon = e.target.checked; refreshRooms(); });
$('#f-tv').addEventListener('change', e => { filters.tv = e.target.checked; refreshRooms(); });
$('#f-bathroom').addEventListener('change', e => { filters.bathroom = e.target.checked; refreshRooms(); });

$('#f-clear').addEventListener('click', () => {
  filters.type = ''; filters.status = '';
  filters.aircon = false; filters.tv = false; filters.bathroom = false;
  $('#f-type').value = '';
  $('#f-status').value = '';
  $('#f-aircon').checked = false;
  $('#f-tv').checked = false;
  $('#f-bathroom').checked = false;
  refreshRooms();
});

$('#refresh-btn').addEventListener('click', () => refreshRooms());

// ============================================================
//  MODAL — Admit patient
// ============================================================
const modal     = $('#modal');
const admitForm = $('#admit-form');
const roomSel   = $('#room_id');
const contagiousChk = $('#is_contagious');
const contagionWarn = $('#contagion-warning');
const modalErr  = $('#modal-error');
const amenitiesPreview = $('#room-amenities-preview');

let availableRooms = [];

function openModal() {
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.setAttribute('aria-hidden', 'false');
  admitForm.reset();
  modalErr.classList.add('hidden');
  contagionWarn.classList.add('hidden');
  amenitiesPreview.classList.add('hidden');
  populateRoomSelect(false);
  $('#first_name').focus();
}

function openAdmitModal(preselectedRoomId) {
  openModal();
  if (preselectedRoomId) {
    roomSel.value = preselectedRoomId;
    updateAmenityPreview();
  }
}

function closeModal() {
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  modal.setAttribute('aria-hidden', 'true');
}

$$('[data-close]').forEach(el => el.addEventListener('click', closeModal));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

$('#admit-btn').addEventListener('click', () => openModal());

contagiousChk.addEventListener('change', () => {
  const isContagious = contagiousChk.checked;
  contagionWarn.classList.toggle('hidden', !isContagious);
  populateRoomSelect(isContagious);
});

function populateRoomSelect(contagiousOnly) {
  const usable = availableRooms.filter(r => {
    if (r.status === 'Maintenance' || r.beds_available <= 0) return false;
    if (contagiousOnly) return r.is_isolation_unit && r.bed_capacity === 1;
    return true;
  });
  roomSel.innerHTML = '<option value="">Select a room…</option>' +
    usable.map(r => `<option value="${r.room_id}">${escapeHTML(r.room_number)} — ${escapeHTML(r.type_name)} (${r.beds_available} bed${r.beds_available !== 1 ? 's' : ''} free)</option>`).join('');
  updateAmenityPreview();
}

roomSel.addEventListener('change', updateAmenityPreview);

function updateAmenityPreview() {
  const rid  = Number(roomSel.value);
  const room = availableRooms.find(r => r.room_id === rid);
  if (!room) { amenitiesPreview.classList.add('hidden'); return; }
  const badges = [];
  if (room.has_aircon)           badges.push('<span class="amenity-badge"><i class="ri-snowy-line" aria-hidden="true"></i> AC</span>');
  if (room.has_tv)               badges.push('<span class="amenity-badge"><i class="ri-tv-line" aria-hidden="true"></i> TV</span>');
  if (room.has_private_bathroom) badges.push('<span class="amenity-badge"><i class="ri-shower-line" aria-hidden="true"></i> Bath</span>');
  if (room.is_isolation_unit)    badges.push('<span class="amenity-badge amenity-badge--iso"><i class="ri-shield-line" aria-hidden="true"></i> Isolation</span>');
  if (!badges.length) { amenitiesPreview.classList.add('hidden'); return; }
  amenitiesPreview.innerHTML = badges.join('');
  amenitiesPreview.classList.remove('hidden');
}

admitForm.addEventListener('submit', async e => {
  e.preventDefault();
  modalErr.classList.add('hidden');
  const submit = admitForm.querySelector('[type=submit]');
  submit.disabled = true;

  const body = {
    first_name:     admitForm.first_name.value.trim(),
    last_name:      admitForm.last_name.value.trim(),
    contact_number: admitForm.contact_number.value.trim() || null,
    medical_case:   admitForm.medical_case.value.trim() || null,
    is_contagious:  admitForm.is_contagious.checked,
    room_id:        Number(admitForm.room_id.value),
  };

  try {
    await api.post('/api/admissions', body);
    closeModal();
    showToast('Patient admitted successfully.', 'success');
    await refreshRooms();
    if (currentPage === 'patients')   loadPatients();
    if (currentPage === 'admissions') loadAdmissions();
  } catch (err) {
    modalErr.textContent = err.message;
    modalErr.classList.remove('hidden');
  } finally {
    submit.disabled = false;
  }
});

async function discharge(admissionId) {
  if (!confirm('Discharge this patient?')) return;
  try {
    await api.patch(`/api/admissions/${admissionId}/discharge`);
    showToast('Patient discharged.', 'success');
    await refreshRooms();
    if (currentPage === 'patients')   loadPatients();
    if (currentPage === 'admissions') loadAdmissions();
  } catch (err) {
    showToast('Discharge failed: ' + err.message, 'error');
  }
}

// ============================================================
//  TOAST
// ============================================================
let toastTimer;
function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
}

// ============================================================
//  CLOCK & AUTO-REFRESH
// ============================================================
function updateClock() {
  const el = $('#refresh-clock');
  if (el) el.textContent = `SQLite · ${new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

setInterval(() => {
  if (currentPage === 'dashboard') refreshRooms();
}, 15000);

// ============================================================
//  BOOTSTRAP
// ============================================================
async function init() {
  try {
    // Populate room types filter
    allRoomTypes = await api.get('/api/room-types');
    const typeSelect = $('#f-type');
    allRoomTypes.forEach(rt => {
      const opt = document.createElement('option');
      opt.value = rt.type_name;
      opt.textContent = rt.type_name;
      typeSelect.appendChild(opt);
    });
    // Pre-load all rooms for modal select
    availableRooms = await api.get('/api/rooms');
  } catch (err) {
    console.warn('Init error:', err);
  }

  // Navigate to the current hash page
  navigateTo(getPageFromHash());
}

init();
