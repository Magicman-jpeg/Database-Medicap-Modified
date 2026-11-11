// =============================================================
//  Dashboard page logic — uses shared Store + UI modules.
// =============================================================
import { UI, $, $$, escapeHTML, toast, statusStyle } from './ui.js';
import { Store } from './store.js';

UI.mountChrome('dashboard');

const filters = { department: '', type: '', status: '' };

function renderStats(rooms) {
  const usableRooms = rooms.filter(room => room.status !== 'Maintenance');
  const usableBeds = usableRooms.reduce((sum, room) => sum + room.max_capacity, 0);
  const occupied = usableRooms.reduce((sum, room) => sum + room.current_occupancy, 0);
  const admittable = usableRooms.reduce((sum, room) => sum + room.beds_available, 0);
  const fullRooms = usableRooms.filter(room => room.status === 'Full').length;
  const pct = usableBeds ? Math.round(occupied / usableBeds * 100) : 0;

  const tiles = [
    { label: 'Usable beds', value: usableBeds, tone: 'metric--blue' },
    { label: 'Occupied', value: occupied, tone: '' },
    { label: 'Admittable', value: admittable, tone: 'metric--green' },
    { label: 'Full rooms', value: fullRooms, tone: fullRooms ? 'metric--red' : '' },
  ];

  $('#stats').innerHTML = tiles.map((tile, index) => `
    <div class="metric ${tile.tone}">
      <div class="metric__top">
        <p class="metric__label">${tile.label}</p>
        <span class="metric__index">0${index + 1}</span>
      </div>
      <p class="metric__value">${tile.value}</p>
    </div>`).join('') + `
    <div class="occupancy-summary">
      <div class="occupancy-summary__meta"><span>Occupancy of usable beds</span><span>${pct}%</span></div>
      <div class="gauge-track" role="progressbar" aria-label="Occupancy of usable beds" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="gauge-fill ${pct >= 100 ? 'gauge-fill--red' : pct >= 80 ? 'gauge-fill--amber' : 'gauge-fill--green'}" style="width:${pct}%"></div>
      </div>
    </div>`;
}

function renderRooms() {
  const rooms = Store.roomsView(filters);
  const admissions = Store.admissionsView({ activeOnly: true });
  renderStats(Store.roomsView());

  const byRoom = {};
  admissions.forEach(admission => (byRoom[admission.room_id] ||= []).push(admission));

  $('#rooms-empty').classList.toggle('hidden', rooms.length > 0);
  $('#rooms').innerHTML = rooms.map(room => {
    const beds = room.beds_available;
    const style = statusStyle(room.status, beds, room.current_occupancy);
    const disabled = room.status === 'Full' || room.status === 'Maintenance' || beds <= 0;
    const patients = byRoom[room.room_id] || [];
    const roomNumber = escapeHTML(room.room_number);
    const roomType = escapeHTML(room.room_type);
    const department = escapeHTML(room.department_name);

    return `
    <article class="room-card ${style.card}">
      <div class="room-card__header">
        <div>
          <h3 class="room-card__title">${roomNumber}</h3>
          <p class="room-card__meta">${roomType} · ${department}</p>
        </div>
        <span class="status-badge ${style.badge}"><i class="${style.icon}" aria-hidden="true"></i> ${style.label}</span>
      </div>
      <div class="capacity-line">
        <span class="capacity-count"><strong>${room.current_occupancy}</strong> / ${room.max_capacity} beds</span>
        <span>${room.occupancy_pct}% full</span>
      </div>
      <div class="gauge-track" role="progressbar" aria-valuenow="${room.occupancy_pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${roomNumber} occupancy">
        <div class="gauge-fill ${style.bar}" style="width:${room.occupancy_pct}%"></div>
      </div>
      <p class="capacity-note">${room.status === 'Maintenance' ? 'Unavailable during maintenance' : `${beds} bed${beds === 1 ? '' : 's'} can accept patients`}</p>
      ${patients.length ? `
      <ul class="patient-list" aria-label="Active patients in ${roomNumber}">
        ${patients.map(patient => {
          const patientName = `${escapeHTML(patient.first_name)} ${escapeHTML(patient.last_name)}`;
          return `
          <li class="patient-row">
            <span><i class="ri-user-line" aria-hidden="true"></i> ${patientName}</span>
            <button data-discharge="${Number(patient.admission_id)}" aria-label="Discharge ${patientName} from ${roomNumber}" class="button button--quiet">Discharge</button>
          </li>`;
        }).join('')}
      </ul>` : `<p class="empty-note"><i class="ri-user-unfollow-line" aria-hidden="true"></i> No active patients</p>`}
      <button data-admit-room="${Number(room.room_id)}" ${disabled ? 'disabled' : ''} class="room-action">
        ${disabled ? (room.status === 'Maintenance' ? 'Under maintenance' : 'No beds available') : `Admit here · ${beds} open`}
      </button>
    </article>`;
  }).join('');
}

// ---- Modal ----
const modal = $('#modal');
let returnFocus = null;
let isolatedElements = [];

function setBackgroundInert(enabled) {
  if (enabled) {
    if (isolatedElements.length) return;
    isolatedElements = [...document.body.children]
      .filter(element => element !== modal && element.tagName !== 'SCRIPT')
      .map(element => ({
        element,
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: 'inert' in element ? element.inert : null,
      }));
    isolatedElements.forEach(({ element }) => {
      if ('inert' in element) element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });
  } else {
    isolatedElements.forEach(({ element, ariaHidden, inert }) => {
      if ('inert' in element && inert !== null) element.inert = inert;
      if (ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', ariaHidden);
    });
    isolatedElements = [];
  }
}

function openModal(presetRoomId = '') {
  if (!modal.classList.contains('hidden')) return;
  returnFocus = document.activeElement;
  const rooms = Store.roomsView({ status: 'Available' });
  const select = $('#room_id');
  select.innerHTML = '<option value="">Select a room…</option>' +
    rooms.map(room => `<option value="${Number(room.room_id)}">${escapeHTML(room.room_number)} — ${escapeHTML(room.room_type)} (${room.beds_available} open)</option>`).join('');
  $('#modal-error').textContent = '';
  $('#modal-error').classList.add('hidden');
  $('#admit-form').reset();
  if (presetRoomId) select.value = String(presetRoomId);
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.setAttribute('aria-hidden', 'false');
  $('#first_name').focus();
  setBackgroundInert(true);
}

function closeModal(restoreFocus = true) {
  if (modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  modal.setAttribute('aria-hidden', 'true');
  setBackgroundInert(false);
  if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
}

function handleModalKeys(event) {
  if (modal.classList.contains('hidden')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = $$('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]', modal);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// ---- Events ----
$('#admit-btn').addEventListener('click', () => openModal());
$('#reset-btn').addEventListener('click', () => {
  if (!window.confirm('Reset all demo patients, admissions, and room occupancy?')) return;
  Store.reset();
  renderRooms();
  toast('Demo reset');
});
$$('[data-close]').forEach(element => element.addEventListener('click', closeModal));
document.addEventListener('keydown', handleModalKeys);

$('#f-department').addEventListener('change', event => { filters.department = event.target.value; renderRooms(); });
$('#f-type').addEventListener('change', event => { filters.type = event.target.value; renderRooms(); });
$('#f-status').addEventListener('change', event => { filters.status = event.target.value; renderRooms(); });
$('#f-clear').addEventListener('click', () => {
  filters.department = filters.type = filters.status = '';
  $('#f-department').value = '';
  $('#f-type').value = '';
  $('#f-status').value = '';
  renderRooms();
  $('#f-department').focus();
});

$('#rooms').addEventListener('click', event => {
  const dischargeBtn = event.target.closest('[data-discharge]');
  const admitBtn = event.target.closest('[data-admit-room]');
  try {
    if (dischargeBtn) {
      Store.discharge(dischargeBtn.dataset.discharge);
      toast('Patient discharged');
      renderRooms();
    } else if (admitBtn && !admitBtn.disabled) {
      openModal(admitBtn.dataset.admitRoom);
    }
  } catch (error) {
    toast(error.message, 'err');
  }
});

$('#admit-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    Store.admit({
      first_name: $('#first_name').value,
      last_name: $('#last_name').value,
      contact_number: $('#contact_number').value,
      room_id: $('#room_id').value,
    });
    closeModal(false);
    toast('Patient admitted');
    renderRooms();
    $('#admit-btn').focus();
  } catch (error) {
    const errorMessage = $('#modal-error');
    errorMessage.textContent = error.message;
    errorMessage.classList.remove('hidden');
  }
});

// ---- Boot ----
$('#f-department').innerHTML = '<option value="">All departments</option>' +
  Store.departments().map(department => `<option value="${Number(department.department_id)}">${escapeHTML(department.department_name)}</option>`).join('');
renderRooms();
