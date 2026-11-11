// =============================================================
//  Hospital Patient & Room Capacity Management System
//  Express REST API + static frontend, backed by local SQLite.
// =============================================================
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDatabase, ping, transaction } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialise the database on startup (idempotent).
initDatabase();

// Helper: throw an HTTP-style error with a status code.
const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });

// Synchronous route wrapper — better-sqlite3 is sync, so we only
// need try/catch for error handling (no async/await required).
const sync = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  }
};

// -------------------------------------------------------------
//  GET /api/health
// -------------------------------------------------------------
app.get('/api/health', sync((_req, res) => {
  ping();
  res.json({ ok: true });
}));

// -------------------------------------------------------------
//  GET /api/room-types  — list all room types with their amenities
// -------------------------------------------------------------
app.get('/api/room-types', sync((_req, res) => {
  const rows = db.prepare('SELECT * FROM room_types ORDER BY type_id').all();
  res.json(rows);
}));

// -------------------------------------------------------------
//  GET /api/rooms  — rooms joined to their room type for amenities
//  Supports filters: ?type= &status= &aircon=1 &tv=1 &bathroom=1
// -------------------------------------------------------------
app.get('/api/rooms', sync((req, res) => {
  const { type, status, aircon, tv, bathroom } = req.query;
  const where = [];
  const params = [];

  if (type)   { where.push('rt.type_name = ?'); params.push(String(type)); }
  if (status) { where.push('r.status = ?');     params.push(String(status)); }
  if (aircon === '1')   where.push('rt.has_aircon = 1');
  if (tv === '1')       where.push('rt.has_tv = 1');
  if (bathroom === '1') where.push('rt.has_private_bathroom = 1');

  const sql = `
    SELECT  r.room_id, r.room_number, r.current_occupancy, r.status,
            rt.type_id, rt.type_name, rt.is_isolation_unit,
            rt.has_aircon, rt.has_tv, rt.has_private_bathroom, rt.bed_capacity,
            (rt.bed_capacity - r.current_occupancy)                            AS beds_available,
            ROUND(CAST(r.current_occupancy AS REAL) / rt.bed_capacity * 100)     AS occupancy_pct
      FROM  rooms r
      JOIN  room_types rt ON rt.type_id = r.type_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY  rt.type_name, r.room_number`;

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
}));

// -------------------------------------------------------------
//  GET /api/admissions  — active admissions with patient + room info
//  Use ?active=false to include discharged admissions too.
// -------------------------------------------------------------
app.get('/api/admissions', sync((req, res) => {
  const activeOnly = req.query.active !== 'false';
  const rows = db.prepare(`
    SELECT  a.admission_id, a.patient_id, a.room_id, a.admission_date,
            a.discharge_date, a.status,
            p.first_name, p.last_name, p.contact_number,
            p.medical_case, p.is_contagious,
            r.room_number, rt.type_name
      FROM  admissions a
      JOIN  patients    p  ON p.patient_id  = a.patient_id
      JOIN  rooms       r  ON r.room_id     = a.room_id
      JOIN  room_types  rt ON rt.type_id    = r.type_id
      ${activeOnly ? "WHERE a.status = 'Active'" : ''}
      ORDER BY  a.admission_date DESC`).all();
  res.json(rows);
}));

// -------------------------------------------------------------
//  POST /api/admissions  — register + admit a patient
//
//  Body: { first_name, last_name, contact_number,
//          medical_case, is_contagious, room_id }
//
//  CRUCIAL BUSINESS RULE:
//    If the patient is contagious (is_contagious == true) they may
//    ONLY be placed in a room whose room type has:
//      is_isolation_unit = 1  AND  bed_capacity = 1
//    A clear error is returned if this is violated.
//
//  Occupancy + room status are updated in the same transaction so
//  they can never drift out of sync.
// -------------------------------------------------------------
app.post('/api/admissions', sync((req, res) => {
  const { first_name, last_name, contact_number, medical_case, is_contagious, room_id } = req.body || {};

  if (!first_name?.trim() || !last_name?.trim()) {
    throw httpError(400, 'first_name and last_name are required.');
  }
  if (!room_id) throw httpError(400, 'room_id is required.');

  const contagious = is_contagious ? 1 : 0;

  const result = transaction(() => {
    // --- Fetch the room + its type in one go ---
    const room = db.prepare(`
      SELECT  r.room_id, r.current_occupancy, r.status,
              rt.bed_capacity, rt.is_isolation_unit, rt.type_name
        FROM  rooms r
        JOIN  room_types rt ON rt.type_id = r.type_id
       WHERE  r.room_id = ?`).get(Number(room_id));

    if (!room) throw httpError(404, 'Room not found.');
    if (room.status === 'Maintenance') {
      throw httpError(409, 'Room is under maintenance and cannot accept patients.');
    }
    if (room.current_occupancy >= room.bed_capacity) {
      throw httpError(409, 'Room is already full.');
    }

    // --- CONTAGION VALIDATION (the core professor requirement) ---
    if (contagious === 1) {
      if (!room.is_isolation_unit) {
        throw httpError(
          409,
          'Contagious patients can only be assigned to Isolation units. ' +
          `"${room.type_name}" is not an isolation room.`
        );
      }
      if (room.bed_capacity !== 1) {
        throw httpError(
          409,
          'Contagious patients require a single-occupancy room (bed_capacity = 1). ' +
          `This room has bed_capacity = ${room.bed_capacity}.`
        );
      }
    }

    // --- Create the patient ---
    const pResult = db.prepare(`
      INSERT INTO patients (first_name, last_name, contact_number, medical_case, is_contagious, admission_status)
      VALUES (?, ?, ?, ?, ?, 'Admitted')`).run(
      first_name.trim(),
      last_name.trim(),
      contact_number?.trim() || null,
      medical_case?.trim() || null,
      contagious
    );
    const patientId = Number(pResult.lastInsertRowid);

    // --- Create the active admission ---
    const aResult = db.prepare(`
      INSERT INTO admissions (patient_id, room_id, status)
      VALUES (?, ?, 'Active')`).run(patientId, room.room_id);

    // --- Update room occupancy + status atomically ---
    const newOccupancy = room.current_occupancy + 1;
    const newStatus = newOccupancy >= room.bed_capacity ? 'Full' : 'Available';
    db.prepare('UPDATE rooms SET current_occupancy = ?, status = ? WHERE room_id = ?')
      .run(newOccupancy, newStatus, room.room_id);

    return {
      admission_id: Number(aResult.lastInsertRowid),
      patient_id: patientId,
      room_id: room.room_id,
    };
  })();

  res.status(201).json(result);
}));

// -------------------------------------------------------------
//  PATCH /api/admissions/:id/discharge  — discharge a patient
//  Frees the bed, sets discharge_date, marks patient Discharged.
// -------------------------------------------------------------
app.patch('/api/admissions/:id/discharge', sync((req, res) => {
  const admissionId = Number(req.params.id);
  if (!admissionId) throw httpError(400, 'Invalid admission id.');

  const result = transaction(() => {
    const adm = db.prepare(
      'SELECT admission_id, patient_id, status, room_id FROM admissions WHERE admission_id = ?'
    ).get(admissionId);
    if (!adm) throw httpError(404, 'Admission not found.');
    if (adm.status !== 'Active') throw httpError(409, 'Admission is not active.');

    db.prepare(`
      UPDATE admissions SET status = 'Discharged', discharge_date = datetime('now', 'localtime')
       WHERE admission_id = ?`).run(admissionId);
    db.prepare("UPDATE patients SET admission_status = 'Discharged' WHERE patient_id = ?")
      .run(adm.patient_id);

    // Decrement occupancy and reopen the room (unless maintenance).
    const room = db.prepare(`
      SELECT  r.current_occupancy, r.status, rt.bed_capacity
        FROM  rooms r JOIN room_types rt ON rt.type_id = r.type_id
       WHERE  r.room_id = ?`).get(adm.room_id);
    const newOccupancy = Math.max(room.current_occupancy - 1, 0);
    const newStatus = room.status === 'Maintenance'
      ? 'Maintenance'
      : newOccupancy >= room.bed_capacity ? 'Full' : 'Available';
    db.prepare('UPDATE rooms SET current_occupancy = ?, status = ? WHERE room_id = ?')
      .run(newOccupancy, newStatus, adm.room_id);

    return { ok: true, admission_id: admissionId };
  })();

  res.json(result);
}));

// -------------------------------------------------------------
//  PATCH /api/rooms/:id/status  — set Maintenance / Available
// -------------------------------------------------------------
app.patch('/api/rooms/:id/status', sync((req, res) => {
  const roomId = Number(req.params.id);
  const { status } = req.body || {};
  if (!['Available', 'Maintenance'].includes(status)) {
    throw httpError(400, "status must be 'Available' or 'Maintenance'.");
  }

  const room = db.prepare(`
    SELECT  r.current_occupancy, r.status, rt.bed_capacity
      FROM  rooms r JOIN room_types rt ON rt.type_id = r.type_id
     WHERE  r.room_id = ?`).get(roomId);
  if (!room) throw httpError(404, 'Room not found.');

  let next = status;
  if (status === 'Available' && room.current_occupancy >= room.bed_capacity) {
    next = 'Full';
  }
  db.prepare('UPDATE rooms SET status = ? WHERE room_id = ?').run(next, roomId);
  res.json({ ok: true, status: next });
}));

// -------------------------------------------------------------
//  GET /api/patients  — list all patients
//  Use ?status=Admitted or ?status=Discharged to filter.
// -------------------------------------------------------------
app.get('/api/patients', sync((req, res) => {
  const { status } = req.query;
  const where = status ? 'WHERE p.admission_status = ?' : '';
  const params = status ? [String(status)] : [];
  const rows = db.prepare(`
    SELECT  p.patient_id, p.first_name, p.last_name, p.contact_number,
            p.medical_case, p.is_contagious, p.admission_status, p.created_at,
            a.admission_id, a.room_id, a.admission_date, a.discharge_date,
            r.room_number, rt.type_name
      FROM  patients p
      LEFT JOIN admissions a ON a.patient_id = p.patient_id AND a.status = 'Active'
      LEFT JOIN rooms r ON r.room_id = a.room_id
      LEFT JOIN room_types rt ON rt.type_id = r.type_id
      ${where}
      ORDER BY p.patient_id DESC`).all(...params);
  res.json(rows);
}));

// -------------------------------------------------------------
//  Fallback to the dashboard for any non-API route.
// -------------------------------------------------------------
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`\n  Hospital Capacity System running:  http://localhost:${PORT}\n`);
});
