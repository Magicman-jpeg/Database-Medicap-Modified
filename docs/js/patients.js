// =============================================================
//  Patients page logic — searchable demo patient table.
// =============================================================
import { UI, $, escapeHTML, toast } from './ui.js';
import { Store } from './store.js';

UI.mountChrome('patients');

const state = { q: '', status: '' };

function statusBadge(status) {
  if (status === 'Admitted') return 'status-badge--available';
  return 'status-badge--maintenance';
}

function render() {
  let rows = Store.patientsView();
  const query = state.q.trim().toLowerCase();
  if (query) rows = rows.filter(patient => (`${patient.first_name} ${patient.last_name}`).toLowerCase().includes(query));
  if (state.status) rows = rows.filter(patient => patient.admission_status === state.status);

  $('#empty').classList.toggle('hidden', rows.length > 0);
  $('#rows').innerHTML = rows.map(patient => {
    const patientName = `${escapeHTML(patient.first_name)} ${escapeHTML(patient.last_name)}`;
    return `
    <tr>
      <td class="font-mono">${Number(patient.patient_id)}</td>
      <td><strong>${patientName}</strong></td>
      <td>${patient.contact_number ? escapeHTML(patient.contact_number) : '—'}</td>
      <td><span class="status-badge ${statusBadge(patient.admission_status)}">${escapeHTML(patient.admission_status)}</span></td>
      <td class="font-mono">${patient.current_room ? escapeHTML(patient.current_room) : '—'}</td>
      <td>${Number(patient.total_admissions)}</td>
      <td class="text-right">
        ${patient.current_admission_id
          ? `<button data-discharge="${Number(patient.current_admission_id)}" aria-label="Discharge ${patientName}" class="button button--quiet">Discharge</button>`
          : `<span>—</span>`}
      </td>
    </tr>`;
  }).join('');
}

$('#search').addEventListener('input', event => { state.q = event.target.value; render(); });
$('#f-status').addEventListener('change', event => { state.status = event.target.value; render(); });
$('#rows').addEventListener('click', event => {
  const button = event.target.closest('[data-discharge]');
  if (!button) return;
  try {
    Store.discharge(button.dataset.discharge);
    toast('Patient discharged');
    render();
  } catch (error) {
    toast(error.message, 'err');
  }
});

render();
