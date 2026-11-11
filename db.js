// =============================================================
//  SQLite database connection (Node.js built-in node:sqlite)
//  Zero external dependencies — the database is a single local
//  file.  No npm packages required for the database layer.
// =============================================================
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Relative path — works from any folder the project is copied to.
const DB_PATH = path.join(__dirname, 'hospital.db');

/** @type {DatabaseSync} */
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * Initialise the database from schema.sql if it does not yet exist.
 * Idempotent: checks for the `room_types` table before running.
 */
export function initDatabase() {
  const exists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'room_types'"
  ).get();

  if (!exists) {
    const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);
    console.log('  \u2713 Database initialised with sample data.');
  }
}

/**
 * Transaction helper — wraps a function so it runs inside
 * BEGIN … COMMIT, with automatic ROLLBACK on error.
 */
export function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN TRANSACTION');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

/** Quick connectivity check (used by the /api/health route). */
export function ping() {
  db.prepare('SELECT 1').get();
}
