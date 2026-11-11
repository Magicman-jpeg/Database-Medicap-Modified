-- =============================================================
--  Hospital Patient & Room Capacity Management System
--  SQLite schema + sample data
--  Entities: room_types, rooms, patients, admissions
--  Design principle: "walang labis, walang kulang"
--  (nothing superfluous, nothing missing)
-- =============================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------
-- room_types
--   Defines room categories and their amenities.
--   is_isolation_unit + bed_capacity = 1  =>  single-occupancy
--   isolation room that can accept contagious patients.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_types (
  type_id              INTEGER PRIMARY KEY AUTOINCREMENT,
  type_name            TEXT    NOT NULL UNIQUE,
  is_isolation_unit    INTEGER NOT NULL DEFAULT 0 CHECK (is_isolation_unit IN (0, 1)),
  has_aircon           INTEGER NOT NULL DEFAULT 0 CHECK (has_aircon IN (0, 1)),
  has_tv               INTEGER NOT NULL DEFAULT 0 CHECK (has_tv IN (0, 1)),
  has_private_bathroom INTEGER NOT NULL DEFAULT 0 CHECK (has_private_bathroom IN (0, 1)),
  bed_capacity         INTEGER NOT NULL DEFAULT 1 CHECK (bed_capacity > 0)
);

-- -------------------------------------------------------------
-- rooms
--   Physical room instances.  bed_capacity is inherited from
--   the linked room_type (normalised — avoids data duplication).
--   current_occupancy and status are runtime state managed by
--   the application layer on admit / discharge.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  room_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  room_number       TEXT    NOT NULL UNIQUE,
  type_id           INTEGER NOT NULL REFERENCES room_types(type_id)
                          ON UPDATE CASCADE ON DELETE RESTRICT,
  current_occupancy INTEGER NOT NULL DEFAULT 0 CHECK (current_occupancy >= 0),
  status            TEXT    NOT NULL DEFAULT 'Available'
                          CHECK (status IN ('Available', 'Full', 'Maintenance'))
);

-- -------------------------------------------------------------
-- patients
--   medical_case   — free-text diagnosis / reason for admission
--   is_contagious  — 1 if the patient poses an infection risk;
--                    such patients MUST go to a single-occupancy
--                    Isolation room (enforced in the API layer).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  patient_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name        TEXT    NOT NULL,
  last_name         TEXT    NOT NULL,
  contact_number    TEXT,
  medical_case      TEXT,
  is_contagious     INTEGER NOT NULL DEFAULT 0 CHECK (is_contagious IN (0, 1)),
  admission_status  TEXT    NOT NULL DEFAULT 'Discharged'
                          CHECK (admission_status IN ('Admitted', 'Discharged', 'Transferred')),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- -------------------------------------------------------------
-- admissions
--   One row per patient-room assignment over time.
--   A patient may have at most one Active admission (enforced
--   by the partial unique index below).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admissions (
  admission_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id     INTEGER NOT NULL REFERENCES patients(patient_id)
                          ON UPDATE CASCADE ON DELETE RESTRICT,
  room_id        INTEGER NOT NULL REFERENCES rooms(room_id)
                          ON UPDATE CASCADE ON DELETE RESTRICT,
  admission_date TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  discharge_date TEXT,
  status         TEXT    NOT NULL DEFAULT 'Active'
                          CHECK (status IN ('Active', 'Discharged'))
);

-- Partial unique index: a patient can have only one active admission.
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_active_admission
  ON admissions (patient_id) WHERE status = 'Active';

CREATE INDEX IF NOT EXISTS idx_adm_room   ON admissions (room_id);
CREATE INDEX IF NOT EXISTS idx_adm_status ON admissions (status);

-- =============================================================
--  SAMPLE DATA  (inserted only on first database initialisation)
-- =============================================================

-- Room types with varied amenities
INSERT OR IGNORE INTO room_types
  (type_name, is_isolation_unit, has_aircon, has_tv, has_private_bathroom, bed_capacity)
VALUES
  ('ICU',            0, 1, 0, 0, 5),
  ('Private',        0, 1, 1, 1, 1),
  ('Semi-Private',   0, 1, 1, 0, 2),
  ('General Ward',   0, 0, 0, 0, 8),
  ('Isolation',     1, 1, 1, 1, 1);

-- Physical rooms (one per row; bed_capacity comes from the type)
INSERT OR IGNORE INTO rooms (room_number, type_id) VALUES
  ('ICU-101',  1),
  ('ICU-102',  1),
  ('PRIV-201', 2),
  ('PRIV-202', 2),
  ('SEMI-301', 3),
  ('WARD-401', 4),
  ('WARD-402', 4),
  ('ISO-501',  5),
  ('ISO-502',  5);

-- Put one room into maintenance to show that state in the UI.
UPDATE rooms SET status = 'Maintenance' WHERE room_number = 'PRIV-202';

-- Patients — some are contagious (is_contagious = 1)
INSERT OR IGNORE INTO patients
  (first_name, last_name, contact_number, medical_case, is_contagious, admission_status)
VALUES
  ('Maria',  'Santos',    '0917-100-1001', 'Cardiac arrhythmia',     0, 'Admitted'),
  ('Jose',   'Reyes',     '0917-100-1002', 'Post-surgery recovery',  0, 'Admitted'),
  ('Ana',    'Cruz',      '0917-100-1003', 'Pulmonary tuberculosis', 1, 'Admitted'),
  ('Pedro',  'Dela Cruz', '0917-100-1004', 'Fractured femur',        0, 'Discharged'),
  ('Liza',   'Mendoza',   '0917-100-1005', 'Measles',               1, 'Discharged');

-- Active admissions (Ana — a contagious patient — is in ISO-501, an Isolation unit)
INSERT OR IGNORE INTO admissions (patient_id, room_id, status) VALUES
  (1, 1, 'Active'),   -- Maria -> ICU-101
  (2, 1, 'Active'),   -- Jose  -> ICU-101
  (3, 8, 'Active');   -- Ana   -> ISO-501 (Isolation)

-- Sync room occupancy + status to match the seeded admissions.
-- ICU-101: 2 of 5 beds used → Available (3 open)
-- ISO-501: 1 of 1 bed used  → Full (Ana, contagious)
UPDATE rooms SET current_occupancy = 2, status = 'Available' WHERE room_number = 'ICU-101';
UPDATE rooms SET current_occupancy = 1, status = 'Full'      WHERE room_number = 'ISO-501';
