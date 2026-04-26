/**
 * RNG Ops — Match Service Worker.
 *
 * Purpose: tablets at the event are on an ad-hoc Wi-Fi from the laptop. If the
 * laptop drops or the tablet wanders out of range, mutating POSTs to
 * /api/match/competitors/.../stages/... must NOT fail. They get queued in
 * IndexedDB and replayed when the laptop is reachable again.
 *
 * Scope: only intercepts POST/PATCH/DELETE to /api/match/*.
 * Read GETs always go to the network — if offline, the UI can show a banner
 * but won't try to serve stale data.
 *
 * Storage: IndexedDB database 'match-sw' with object store 'queue'.
 *   key: auto-incrementing
 *   value: { url, method, body, headers, timestamp }
 *
 * Replay: triggered on every fetch event when network looks OK, and via
 * postMessage({type: 'sync'}) from the page on online events.
 */

const DB_NAME = 'match-sw';
const STORE = 'queue';
const DB_VERSION = 1;

self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(req) {
  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.clone().text() : null;
  const item = {
    url: req.url,
    method: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    body,
    timestamp: Date.now(),
  };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function dequeueAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function deleteItem(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function broadcast(msg) {
  const clients = await self.clients.matchAll();
  for (const c of clients) c.postMessage(msg);
}

let replaying = false;
async function replayQueue() {
  if (replaying) return;
  replaying = true;
  try {
    const items = await dequeueAll();
    if (items.length === 0) return;
    let success = 0;
    let failed = 0;
    for (const item of items) {
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          // Either accepted, or permanently rejected (e.g. 409 conflict, 400
          // bad request). Either way, don't keep retrying forever.
          await deleteItem(item.id);
          success++;
        } else {
          failed++;
          break; // server problems — stop, retry later
        }
      } catch {
        failed++;
        break; // still offline
      }
    }
    if (success > 0) {
      await broadcast({ type: 'queue-replayed', success, failed, remaining: (await dequeueAll()).length });
    }
  } finally {
    replaying = false;
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/api/match/')) return; // only handle match API
  const method = event.request.method.toUpperCase();
  const isMutation = method === 'POST' || method === 'PATCH' || method === 'DELETE' || method === 'PUT';
  if (!isMutation) return; // GETs go straight to network

  event.respondWith((async () => {
    try {
      const res = await fetch(event.request.clone());
      // After a successful network call, attempt to drain any queue.
      replayQueue();
      return res;
    } catch (err) {
      // Network failed — enqueue and respond with synthetic 202 Accepted.
      try {
        await enqueue(event.request);
        await broadcast({ type: 'queued' });
        return new Response(JSON.stringify({ ok: true, queued: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'offline-and-queue-failed' }), {
          status: 503, headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'sync') replayQueue();
  if (event.data?.type === 'queue-status') {
    dequeueAll().then((items) => event.source?.postMessage({ type: 'queue-status', size: items.length }));
  }
});
