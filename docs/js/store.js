// =============================================================
//  Shared in-browser mock store for the MediCap demo.
//  Mirrors schema.sql + the Express backend's capacity logic so
//  every page (dashboard, patients, admissions) stays in sync.
//
//  Data is persisted to sessionStorage so navigating between
//  pages keeps your changes; "Reset Demo" clears it.
// =============================================================

const SEED = () => ({
  departments: [
    { department_id: 1, department_name: 'Emergency' },
    { department_id: 2, department_name: 'Cardiology' },
    { department_id: 3, department_name: 'Pediatrics' },
    { department_id: 4, department_name: 'General Medicine' },
  ],
  rooms: [
    { room_id: 1, room_number: 'ICU-101',   department_id: 1, room_type: 'ICU',          max_capacity: 5, current_occupancy: 0, status: 'Available' },
    { room_id: 2, room_number: 'ICU-102',   department_id: 2, room_type: 'ICU',          max_capacity: 5, current_occupancy: 0, status: 'Available' },
    { room_id: 3, room_number: 'PRIV-201',  department_id: 2, room_type: 'Private',      max_capacity: 1, current_occupancy: 0, status: 'Available' },
    { room_id: 4, room_number: 'SEMI-202',  department_id: 3, room_type: 'Semi-Private', max_capacity: 2, current_occupancy: 0, status: 'Available' },
    { room_id: 5, room_number: 'WARD-301',  department_id: 4, room_type: 'General Ward', max_capacity: 8, current_occupancy: 0, status: 'Available' },
    { room_id: 6, room_number: 'WARD-302',  department_id: 3, room_type: 'General Ward', max_capacity: 8, current_occupancy: 0, status: 'Available' },
    { room_id: 7, room_number: 'MAINT-999', department_id: 1, room_type: 'Private',      max_capacity: 1, current_occupancy: 0, status: 'Maintenance' },
  ],
  patients: [],
  admissions: [],
  seqPatient: 0,
  seqAdmission: 0,
});

const STORAGE_KEY = 'medicap_demo_v1';

function save(d) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}
function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const fresh = SEED();
  seedAdmissions(fresh);  // operates purely on `fresh`, never on module-level db
  save(fresh);
  return fresh;
}

// Declared before load() runs so there is no temporal-dead-zone access.
let db;
db = load();

function now() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

// Mirror of the SQL triggers: recompute room status from occupancy.
function recomputeStatus(room) {
  if (room.status === 'Maintenance') return;
  room.status = room.current_occupancy >= room.max_capacity ? 'Full' : 'Available';
}

function admit({ first_name, last_name, contact_number, room_id }, target = db) {
  if (!first_name?.trim() || !last_name?.trim()) throw new Error('First and last name are required.');
  const room = target.rooms.find(r => r.room_id === Number(room_id));
  if (!room) throw new Error('Room not found.');
  if (room.status === 'Maintenance') throw new Error('Room is under maintenance.');
  if (room.current_occupancy >= room.max_capacity) throw new Error('Room is already full.');

  const patient = {
    patient_id: ++target.seqPatient,
    first_name: first_name.trim(), last_name: last_name.trim(),
    contact_number: contact_number?.trim() || null, admission_status: 'Admitted',
  };
  target.patients.push(patient);

  const admission = {
    admission_id: ++target.seqAdmission,
    patient_id: patient.patient_id, room_id: room.room_id,
    admission_date: now(), discharge_date: null, status: 'Active',
  };
  target.admissions.push(admission);

  room.current_occupancy += 1;
  recomputeStatus(room);
  if (target === db) save(db);
  return admission;
}

function discharge(admissionId) {
  const adm = db.admissions.find(a => a.admission_id === Number(admissionId));
  if (!adm) throw new Error('Admission not found.');
  if (adm.status !== 'Active') throw new Error('Admission is not active.');
  adm.status = 'Discharged';
  adm.discharge_date = now();
  const patient = db.patients.find(p => p.patient_id === adm.patient_id);
  if (patient) patient.admission_status = 'Discharged';
  const room = db.rooms.find(r => r.room_id === adm.room_id);
  if (room) { room.current_occupancy = Math.max(room.current_occupancy - 1, 0); recomputeStatus(room); }
  save(db);
  return { ok: true };
}

function setRoomStatus(roomId, status) {
  const room = db.rooms.find(r => r.room_id === Number(roomId));
  if (!room) throw new Error('Room not found.');
  if (!['Available', 'Maintenance'].includes(status)) throw new Error('Invalid status.');
  room.status = status;
  recomputeStatus(room); // if re-opening a full room, this flips it back to Full
  save(db);
  return room;
}

// Pre-admit a few patients so the demo opens with realistic data.
function seedAdmissions(target) {
  admit({ first_name: 'Maria', last_name: 'Santos',    contact_number: '0917-100-1001', room_id: 1 }, target);
  admit({ first_name: 'Jose',  last_name: 'Reyes',     contact_number: '0917-100-1002', room_id: 1 }, target);
  admit({ first_name: 'Ana',   last_name: 'Cruz',      contact_number: '0917-100-1003', room_id: 4 }, target);
}

function reset() {
  db = SEED();
  seedAdmissions(db);
  save(db);
  return db;
}

// ---- Read models ----
function departments() { return db.departments.slice(); }

function roomsView(filter = {}) {
  return db.rooms
    .filter(r => !filter.department || r.department_id === Number(filter.department))
    .filter(r => !filter.type || r.room_type === filter.type)
    .filter(r => !filter.status || r.status === filter.status)
    .map(r => {
      const dept = db.departments.find(d => d.department_id === r.department_id);
      return {
        ...r,
        beds_available: r.max_capacity - r.current_occupancy,
        occupancy_pct: Math.round(r.current_occupancy / r.max_capacity * 100),
        department_name: dept ? dept.department_name : '',
      };
    })
    .sort((a, b) => (a.department_name + a.room_number).localeCompare(b.department_name + b.room_number));
}

function admissionsView({ activeOnly = false } = {}) {
  return db.admissions
    .filter(a => !activeOnly || a.status === 'Active')
    .map(a => {
      const p = db.patients.find(x => x.patient_id === a.patient_id);
      const r = db.rooms.find(x => x.room_id === a.room_id);
      const dept = db.departments.find(d => d.department_id === r.department_id);
      return {
        ...a,
        first_name: p.first_name, last_name: p.last_name, contact_number: p.contact_number,
        room_number: r.room_number, room_type: r.room_type, department_name: dept?.department_name || '',
      };
    })
    .sort((a, b) => b.admission_id - a.admission_id);
}

function patientsView() {
  return db.patients.map(p => {
    const active = db.admissions.find(a => a.patient_id === p.patient_id && a.status === 'Active');
    const r = active ? db.rooms.find(x => x.room_id === active.room_id) : null;
    const total = db.admissions.filter(a => a.patient_id === p.patient_id).length;
    return {
      ...p,
      current_room: r ? r.room_number : null,
      current_admission_id: active ? active.admission_id : null,
      total_admissions: total,
    };
  }).sort((a, b) => b.patient_id - a.patient_id);
}

export const Store = {
  reset, admit, discharge, setRoomStatus,
  departments, roomsView, admissionsView, patientsView,
};
