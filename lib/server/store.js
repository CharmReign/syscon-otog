// Document store for OneTeamOneGoal, with two interchangeable backends:
//
// - MongoDB, when MONGODB_URI is set. Required on Vercel and other serverless hosts,
//   where the filesystem is read-only and not shared between instances. Each record is
//   one Mongo document whose _id is the record's id.
// - A JSON file (DATA_DIR/db.json) otherwise, for local development and tests. It is
//   rewritten atomically (write to a temp file, then rename) on every change, so data
//   survives restarts.
//
// Large content never goes in here: uploaded files and extracted text are kept by
// lib/server/files.js. Callers only use findAll/findOne/insertOne/updateOne/deleteOne/
// deleteWhere, all async; predicates are plain JS functions in both backends.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { mongoDb, mongoEnabled } from '@/lib/server/mongo';

export const COLLECTIONS = [
  'users', 'documents', 'quizzes', 'attempts', 'auditLog',
  'checklistTemplates', 'releases', 'integrationChecks', 'asisProjects',
  'triageQueries', 'triageSources', 'triageSettings',
];

// Bump when the stored shape changes and add a step to MIGRATIONS (file backend).
export const SCHEMA_VERSION = 1;
const MIGRATIONS = {
  // 1: (db) => { ... }   // migrates a version-0 db to version 1
};

const clone = (x) => (x == null ? x : structuredClone(x));

const checkName = (name) => {
  if (!COLLECTIONS.includes(name)) throw new Error(`Unknown collection: ${name}`);
};

// ---- file backend ----

const KEY = '__otog_store__';

// On Vercel without MONGODB_URI only the temp folder is writable. Data kept there lasts
// only as long as one server instance and isn't shared between instances: fine for
// trying the platform out, not for keeping anything.
const defaultDataDir = () => (process.env.VERCEL ? path.join(os.tmpdir(), 'otog-data') : path.join(process.cwd(), 'data'));

export function dataDir() {
  return path.resolve(process.env.DATA_DIR || defaultDataDir());
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

const col = (name) => state().db.collections[name];

const fileBackend = {
  findAll(name, predicate) {
    const items = col(name);
    return clone(predicate ? items.filter(predicate) : items);
  },
  findOne(name, idOrPredicate) {
    const items = col(name);
    const doc = typeof idOrPredicate === 'function' ? items.find(idOrPredicate) : items.find(x => x.id === idOrPredicate);
    return clone(doc || null);
  },
  insertOne(name, doc) {
    col(name).push(clone(doc));
    persist();
    return clone(doc);
  },
  updateOne(name, id, patch) {
    const items = col(name);
    const i = items.findIndex(x => x.id === id);
    if (i === -1) return null;
    items[i] = { ...items[i], ...clone(patch), id };
    persist();
    return clone(items[i]);
  },
  deleteOne(name, id) {
    const items = col(name);
    const i = items.findIndex(x => x.id === id);
    if (i === -1) return false;
    items.splice(i, 1);
    persist();
    return true;
  },
  deleteWhere(name, predicate) {
    const items = col(name);
    const keep = items.filter(x => !predicate(x));
    const removed = items.length - keep.length;
    if (removed) {
      state().db.collections[name] = keep;
      persist();
    }
    return removed;
  },
};

// ---- MongoDB backend ----

const HIDE_ID = { projection: { _id: 0 } };
const coll = async (name) => (await mongoDb()).collection(name);
// Natural order keeps insertion order, matching the file backend.
const all = async (name) => (await coll(name)).find({}, HIDE_ID).sort({ $natural: 1 }).toArray();

const mongoBackend = {
  async findAll(name, predicate) {
    const items = await all(name);
    return predicate ? items.filter(predicate) : items;
  },
  async findOne(name, idOrPredicate) {
    if (typeof idOrPredicate === 'function') return (await all(name)).find(idOrPredicate) || null;
    return (await coll(name)).findOne({ _id: idOrPredicate }, HIDE_ID);
  },
  async insertOne(name, doc) {
    const copy = clone(doc);
    await (await coll(name)).insertOne({ _id: copy.id, ...copy });
    return clone(doc);
  },
  async updateOne(name, id, patch) {
    const { _id, ...fields } = clone(patch) || {};
    return (await coll(name)).findOneAndUpdate({ _id: id }, { $set: { ...fields, id } }, { ...HIDE_ID, returnDocument: 'after' });
  },
  async deleteOne(name, id) {
    return (await (await coll(name)).deleteOne({ _id: id })).deletedCount > 0;
  },
  async deleteWhere(name, predicate) {
    const ids = (await all(name)).filter(predicate).map(x => x.id);
    if (!ids.length) return 0;
    return (await (await coll(name)).deleteMany({ _id: { $in: ids } })).deletedCount;
  },
};

const backend = () => (mongoEnabled() ? mongoBackend : fileBackend);

// ---- API ----

export async function findAll(name, predicate) {
  checkName(name);
  return backend().findAll(name, predicate);
}

export async function findOne(name, idOrPredicate) {
  checkName(name);
  return backend().findOne(name, idOrPredicate);
}

export async function insertOne(name, doc) {
  checkName(name);
  return backend().insertOne(name, doc);
}

export async function updateOne(name, id, patch) {
  checkName(name);
  return backend().updateOne(name, id, patch);
}

export async function deleteOne(name, id) {
  checkName(name);
  return backend().deleteOne(name, id);
}

export async function deleteWhere(name, predicate) {
  checkName(name);
  return backend().deleteWhere(name, predicate);
}

// Test helper: forget the cached db so the next call re-reads DATA_DIR.
export function _resetCache() { delete globalThis[KEY]; }
