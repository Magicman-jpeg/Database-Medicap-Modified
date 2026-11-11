# MediCap — Hospital Patient & Room Capacity Management System

A full-stack app that manages hospital room/bed capacity with patient case
tracking, contagion isolation rules, and room amenity management.

**Stack:** Node.js (Express) · SQLite (local file) · HTML + Tailwind (CDN) + vanilla JS (Fetch API).

---

## What changed in this refactor

Based on professor feedback, three targeted improvements were made:

### 1. Patient Case & Contagion Isolation
- The `patients` table now has a `medical_case` (free-text diagnosis) and
  `is_contagious` (boolean) field.
- **Business rule enforced in the API:** if `is_contagious == true`, the patient
  can **only** be assigned to a room whose room type has `is_isolation_unit = 1`
  **and** `bed_capacity = 1` (single-occupancy Isolation unit).
- The UI lets you mark a patient as contagious; the room dropdown automatically
  filters to eligible Isolation rooms, and the backend returns a clear error if
  the rule is violated.

### 2. Expanded Room Amenities
- Room types now carry amenity flags: `has_aircon`, `has_tv`,
  `has_private_bathroom`, `bed_capacity`, and `is_isolation_unit`.
- The dashboard shows amenity badges on every room card and offers filter
  checkboxes (Aircon / TV / Bathroom).

### 3. Entity Balance (Minimalist)
- The schema has exactly four entities: `room_types`, `rooms`, `patients`,
  `admissions` — nothing superfluous, nothing missing ("walang labis, walang kulang").
- The old `departments` table was removed; `bed_capacity` was normalised into
  `room_types` so each room inherits its capacity from its type.

---

## Quick start (Windows)

1. **Download/clone** this repository to any local folder.
2. **Double-click `run.bat`** — it will:
   - Check Node.js is installed
   - Run `npm install` (first time only)
   - Initialise the SQLite database (`hospital.db`) with sample data
   - Start the server on `http://localhost:5000`
   - Open your default browser automatically

> Requires [Node.js](https://nodejs.org/) LTS (v18 or newer).

### Manual start
```bash
npm install
npm run init-db      # creates hospital.db with tables + sample data
npm start            # starts the server on port 5000
```
Then open http://localhost:5000

---

## How to replace existing files

If you downloaded the original repo and want to apply this refactor:

1. **Backup** the original folder (optional).
2. **Overwrite** these files with the new versions:
   - `schema.sql` — new SQLite schema (replaces the MySQL schema)
   - `db.js` — SQLite connection (replaces the MySQL pool)
   - `server.js` — updated API with contagion validation + amenity routes
   - `package.json` — updated dependencies (SQLite instead of MySQL)
   - `public/index.html` — updated UI with new form fields + filters
   - `public/app.js` — updated client logic
   - `public/style.css` — appended new styles for amenities/contagion
3. **Add** the new files:
   - `init-db.js` — standalone database initialiser
   - `run.bat` — Windows one-click launcher
4. **Delete** the old lock file if it exists: `package-lock.json` (will be regenerated).
5. **Delete** `.env` and `.env.example` if present — they are no longer needed
   (SQLite needs no credentials; the port defaults to 5000).
6. **Delete** the old MySQL database if you had one — it is no longer used.
7. Run `run.bat` (or `npm install && npm run init-db && npm start`).

---

## Database schema

### room_types
| Column | Type | Description |
|--------|------|-------------|
| `type_id` | INTEGER PK | Auto-increment |
| `type_name` | TEXT UNIQUE | e.g. ICU, Private, Isolation |
| `is_isolation_unit` | INTEGER (0/1) | Single-occupancy isolation flag |
| `has_aircon` | INTEGER (0/1) | Air conditioning |
| `has_tv` | INTEGER (0/1) | Television |
| `has_private_bathroom` | INTEGER (0/1) | Private bathroom |
| `bed_capacity` | INTEGER | Max beds for rooms of this type |

### rooms
| Column | Type | Description |
|--------|------|-------------|
| `room_id` | INTEGER PK | Auto-increment |
| `room_number` | TEXT UNIQUE | e.g. ICU-101, ISO-501 |
| `type_id` | INTEGER FK → room_types | Links to amenities + capacity |
| `current_occupancy` | INTEGER | Runtime state (managed by API) |
| `status` | TEXT | Available / Full / Maintenance |

### patients
| Column | Type | Description |
|--------|------|-------------|
| `patient_id` | INTEGER PK | Auto-increment |
| `first_name` | TEXT | |
| `last_name` | TEXT | |
| `contact_number` | TEXT | |
| `medical_case` | TEXT | Diagnosis / reason for admission |
| `is_contagious` | INTEGER (0/1) | Infectious disease flag |
| `admission_status` | TEXT | Admitted / Discharged / Transferred |
| `created_at` | TEXT | Timestamp |

### admissions
| Column | Type | Description |
|--------|------|-------------|
| `admission_id` | INTEGER PK | Auto-increment |
| `patient_id` | INTEGER FK → patients | |
| `room_id` | INTEGER FK → rooms | |
| `admission_date` | TEXT | Timestamp |
| `discharge_date` | TEXT | Set on discharge |
| `status` | TEXT | Active / Discharged |

A partial unique index ensures a patient can have at most one Active admission.

---

## API

| Method | Route | Purpose |
|--------|-------|---------|
| GET   | `/api/health` | DB connectivity check |
| GET   | `/api/room-types` | List room types + amenities |
| GET   | `/api/rooms` | Rooms with amenities. Query: `?type=&status=&aircon=1&tv=1&bathroom=1` |
| GET   | `/api/admissions?active=true` | Active admissions with patient + room info |
| POST  | `/api/admissions` | Admit: `{ first_name, last_name, contact_number, medical_case, is_contagious, room_id }` |
| PATCH | `/api/admissions/:id/discharge` | Discharge a patient |
| PATCH | `/api/rooms/:id/status` | Set `Available` / `Maintenance` |

### Contagion validation (POST /api/admissions)

If `is_contagious` is `true` and the selected room is not a single-occupancy
Isolation unit, the API returns HTTP 409 with a message like:

> "Contagious patients can only be assigned to Isolation units. 'ICU' is not an isolation room."

---

## How the capacity logic works

1. **Admit** → `INSERT` into `admissions` (status='Active'), then
   `current_occupancy + 1` and flip `status` to `Full` if now at capacity.
   All in one SQLite transaction.
2. **Discharge** → `UPDATE admissions SET status='Discharged'`, then
   `current_occupancy - 1` and reopen the room (unless Maintenance).

Because occupancy is updated atomically within the same transaction as the
admission/discharge, the counts can never drift out of sync.

---

## Notes

- Zero cloud dependencies — the entire system runs locally with a single
  SQLite file (`hospital.db`). No AWS, Firebase, or external database.
- All file paths are relative; the project runs from any folder.
- The `docs/` folder contains the old GitHub Pages demo (unchanged, in-browser
  mock data) and is not required for local operation.
- This is sample/demo software. For real clinical use you'd add
  authentication, audit logging, and data-privacy controls.
