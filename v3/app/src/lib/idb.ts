// IndexedDB wrapper for the offline write queue + per-device meta store.
//
// Phase 1 scaffolding: schema, two stores, and a small CRUD-style API. No
// flush/sync logic — Phase 4 will layer retry/backoff on top of these
// primitives. Phase 1 callers (mostly the DevTools console for verification)
// can enqueue and inspect rows but the queue is never drained.
//
// Database: "rng-ops", version 1.
// Stores:
//   - pending_writes: auto-increment id; one row per recorded operator entry
//   - meta: key/value scratch space (device label, schema version, last sync)

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// What a caller hands us at write time. Reflects what an operator device
// knows in the moment — no server roundtrip required.
export interface PendingWriteEnvelope {
  target_collection: string; // e.g. "match_stage_score_events"
  op: "create" | "update";
  payload: Record<string, unknown>;
  recorded_at_ms: number; // operator-time of the recording
  device_id: string; // device label snapshot, e.g. "Stage-3"
}

// Stored row = envelope + queue bookkeeping. Phase 4 will read attempts
// and last_error to drive retry/backoff. Phase 1 only sets attempts: 0
// and never updates them after enqueue.
export interface PendingWrite extends PendingWriteEnvelope {
  id: number;
  attempts: number;
  last_error?: string;
}

interface RngOpsSchema extends DBSchema {
  pending_writes: {
    key: number;
    value: PendingWrite;
    indexes: { by_recorded_at_ms: number };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = "rng-ops";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RngOpsSchema>> | null = null;

export function openDb(): Promise<IDBPDatabase<RngOpsSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RngOpsSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Single upgrade path for v1. Future versions add migrations here.
        if (!db.objectStoreNames.contains("pending_writes")) {
          const store = db.createObjectStore("pending_writes", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("by_recorded_at_ms", "recorded_at_ms");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueueWrite(
  envelope: PendingWriteEnvelope,
): Promise<number> {
  const db = await openDb();
  // The store has autoIncrement: true with keyPath "id", so passing a row
  // without id lets IDB assign one. The library types want id present, so
  // cast through unknown — runtime IDB ignores undefined id under autoIncrement.
  const row = {
    ...envelope,
    attempts: 0,
  } as unknown as PendingWrite;
  const id = await db.add("pending_writes", row);
  return id;
}

export async function listPending(): Promise<PendingWrite[]> {
  const db = await openDb();
  return db.getAllFromIndex("pending_writes", "by_recorded_at_ms");
}

export async function markFailed(id: number, error: string): Promise<void> {
  const db = await openDb();
  const row = await db.get("pending_writes", id);
  if (!row) return;
  row.attempts += 1;
  row.last_error = error;
  await db.put("pending_writes", row);
}

export async function dequeue(id: number): Promise<void> {
  const db = await openDb();
  await db.delete("pending_writes", id);
}

export async function getMeta<T = unknown>(
  key: string,
): Promise<T | undefined> {
  const db = await openDb();
  return (await db.get("meta", key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await db.put("meta", value, key);
}
