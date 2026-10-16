// File-backed document store for OneTeamOneGoal.
//
// Collections live in one JSON file (DATA_DIR/db.json) that is rewritten atomically
// (write to a temp file, then rename) on every change, so data survives restarts.
// Large content never goes in here: uploaded files live in DATA_DIR/uploads and
// extracted text in DATA_DIR/content (see lib/server/files.js).
//
// Swapping to MongoDB later means reimplementing the functions exported here;
// callers only use findAll/findOne/insertOne/updateOne/deleteOne.
import fs from 'node:fs';
import path from 'node:path';

export const COLLECTIONS = [
  'users', 'documents', 'quizzes', 'attempts', 'auditLog',
  'checklistTemplates', 'releases', 'integrationChecks', 'asisProjects',
  'triageQueries', 'triageSources', 'triageSettings',
];

// Bump when the stored shape changes and add a step to MIGRATIONS.
export const SCHEMA_VERSION = 1;
const MIGRATIONS = {
  // 1: (db) => { ... }   // migrates a version-0 db to version 1
};

const KEY = '__otog_store__';

export function dataDir() {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
}

function dbPath() { return path.join(dataDir(), 'db.json'); }

function emptyDb() {
  const db = { schemaVersion: SCHEMA_VERSION, collections: {} };
  for (const c of COLLECTIONS) db.collections[c] = [];
  return db;
}

function migrate(db) {
  let v = db.schemaVersion || 0;
  while (v < SCHEMA_VERSION) {
    v += 1;
    MIGRATIONS[v]?.(db);
    db.schemaVersion = v;
  }
  for (const c of COLLECTIONS) db.collections[c] ||= [];
  return db;
}

function load() {
  const file = dbPath();
  if (!fs.existsSync(file)) return emptyDb();
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return migrate(JSON.parse(raw));
  } catch (e) {
    // Never silently start empty over a damaged file: that would wipe everyone's data on the next write.
    throw new Error(`Data file ${file} is not valid JSON (${e.message}). Restore it from a backup or move it aside.`);
  }
}

function state() {
  const dir = dataDir();
  // Re-load when DATA_DIR changes (tests point each suite at its own folder).
  if (!globalThis[KEY] || globalThis[KEY].dir !== dir) globalThis[KEY] = { dir, db: load() };
  return globalThis[KEY];
}

function persist() {
  const { dir, db } = state();
  fs.mkdirSync(dir, { recursive: true });
  const file = dbPath();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

const col = (name) => {
  if (!COLLECTIONS.includes(name)) throw new Error(`Unknown collection: ${name}`);
  return state().db.collections[name];
};
const clone = (x) => (x == null ? x : structuredClone(x));

export function findAll(name, predicate) {
  const items = col(name);
  return clone(predicate ? items.filter(predicate) : items);
}

export function findOne(name, idOrPredicate) {
  const items = col(name);
  const doc = typeof idOrPredicate === 'function' ? items.find(idOrPredicate) : items.find(x => x.id === idOrPredicate);
  return clone(doc || null);
}

export function insertOne(name, doc) {
  col(name).push(clone(doc));
  persist();
  return clone(doc);
}

export function updateOne(name, id, patch) {
  const items = col(name);
  const i = items.findIndex(x => x.id === id);
  if (i === -1) return null;
  items[i] = { ...items[i], ...clone(patch), id };
  persist();
  return clone(items[i]);
}

export function deleteOne(name, id) {
  const items = col(name);
  const i = items.findIndex(x => x.id === id);
  if (i === -1) return false;
  items.splice(i, 1);
  persist();
  return true;
}

export function deleteWhere(name, predicate) {
  const items = col(name);
  const keep = items.filter(x => !predicate(x));
  const removed = items.length - keep.length;
  if (removed) {
    state().db.collections[name] = keep;
    persist();
  }
  return removed;
}

// Test helper: forget the cached db so the next call re-reads DATA_DIR.
export function _resetCache() { delete globalThis[KEY]; }
