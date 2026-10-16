// Shared MongoDB connection, used by the store and file storage when MONGODB_URI is set
// (required on Vercel and other serverless hosts, whose filesystem doesn't persist).
// The client is cached on globalThis so warm serverless invocations and dev hot reloads
// reuse one connection pool instead of opening a new one per request.
import { MongoClient } from 'mongodb';

const KEY = '__otog_mongo__';

export const mongoEnabled = () => Boolean(process.env.MONGODB_URI?.trim());

export async function mongoDb() {
  const uri = process.env.MONGODB_URI.trim();
  let cached = globalThis[KEY];
  if (!cached || cached.uri !== uri) {
    const client = new MongoClient(uri, { ignoreUndefined: true, maxPoolSize: 10 });
    // Keep the promise, so concurrent first requests share one connect.
    cached = globalThis[KEY] = { uri, client, ready: client.connect() };
    cached.ready.catch(() => { if (globalThis[KEY] === cached) delete globalThis[KEY]; });
  }
  await cached.ready;
  return cached.client.db(process.env.MONGODB_DB?.trim() || 'otog');
}

// Test helper: close and forget the cached client.
export async function _closeMongo() {
  const cached = globalThis[KEY];
  delete globalThis[KEY];
  if (cached) await cached.client.close().catch(() => {});
}
