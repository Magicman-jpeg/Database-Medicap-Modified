// =============================================================
//  Admissions page logic — chronological demo admission log.
// =============================================================
import { UI, $, escapeHTML } from './ui.js';
import { Store } from './store.js';

UI.mountChrome('admissions');

const state = { status: '' };

function render() {
  let rows = Store.admissionsView();
  if (state.status) rows = rows.filter(admission => admission.status === state.status);

  $('#count').textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
  $('#empty').classList.toggle('hidden', rows.length > 0);

  $('#timeline').innerHTML = rows.map(admission => {
    const active = admission.status === 'Active';
    const dot = active ? 'timeline-dot--active' : '';
    const badge = active ? 'status-badge--available' : 'status-badge--maintenance';
    const patientName = `${escapeHTML(admission.first_name)} ${escapeHTML(admission.last_name)}`;
    const roomNumber = escapeHTML(admission.room_number);

    return `
    <li class="timeline-item">
      <span class="timeline-dot ${dot}" aria-hidden="true"></span>
      <div class="timeline-card">
        <div class="timeline-card__header">
          <h3 class="timeline-card__title">${patientName}
            <span aria-hidden="true">→</span>
            <span class="font-mono">${roomNumber}</span>
          </h3>
          <span class="status-badge ${badge}">${escapeHTML(admission.status)}</span>
        </div>
        <p class="timeline-card__meta">${escapeHTML(admission.room_type)} · ${escapeHTML(admission.department_name)}</p>
        <div class="timeline-card__dates">
          <span><i class="ri-login-box-line" aria-hidden="true"></i> Admitted: ${escapeHTML(admission.admission_date)}</span>
          ${admission.discharge_date ? `<span><i class="ri-logout-box-line" aria-hidden="true"></i> Discharged: ${escapeHTML(admission.discharge_date)}</span>` : ''}
        </div>
      </div>
    </li>`;
  }).join('');
}

$('#f-status').addEventListener('change', event => { state.status = event.target.value; render(); });
render();
