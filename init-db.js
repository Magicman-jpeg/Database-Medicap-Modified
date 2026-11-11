// =============================================================
//  Standalone database initialiser.
//  Run:  node init-db.js
//  Safe to run repeatedly — only creates tables / data if the
//  database file does not yet contain the schema.
// =============================================================
import { initDatabase, db } from './db.js';

initDatabase();
db.close();
console.log('Done.');
