// 背景画像用の IndexedDB ラッパ（localStorage の容量制限を回避）
const DB_NAME = 'cospose';
const STORE = 'backgrounds';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// 1リクエストを Promise 化して実行
function request(mode, run) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = run(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export function putBackground(rec) {
  // rec = { id, name, dataUrl, created }
  return request('readwrite', (store) => store.put(rec)).then(() => rec);
}

export function getBackground(id) {
  return request('readonly', (store) => store.get(id));
}

export function listBackgrounds() {
  return request('readonly', (store) => store.getAll()).then((r) => r || []);
}

export function deleteBackground(id) {
  return request('readwrite', (store) => store.delete(id));
}
