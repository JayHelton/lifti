const DB_NAME = "liftiDB";
const DB_VERSION = 1;
export const STORES = ["templates", "sessions", "exerciseLibrary", "bodyweight", "runs", "settings"];

let dbPromise;

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("templates")) {
        const store = db.createObjectStore("templates", { keyPath: "id" });
        store.createIndex("day", "day", { unique: true });
      }
      if (!db.objectStoreNames.contains("sessions")) {
        const store = db.createObjectStore("sessions", { keyPath: "id" });
        store.createIndex("status", "status");
        store.createIndex("startedAt", "startedAt");
      }
      if (!db.objectStoreNames.contains("exerciseLibrary")) {
        db.createObjectStore("exerciseLibrary", { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains("bodyweight")) {
        const store = db.createObjectStore("bodyweight", { keyPath: "id" });
        store.createIndex("date", "date");
      }
      if (!db.objectStoreNames.contains("runs")) {
        const store = db.createObjectStore("runs", { keyPath: "id" });
        store.createIndex("startTime", "startTime");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function getAll(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  return promisifyRequest(tx.objectStore(storeName).getAll());
}

export async function get(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  return promisifyRequest(tx.objectStore(storeName).get(key));
}

export async function put(storeName, value) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  await txDone(tx);
  return value;
}

export async function bulkPut(storeName, values) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  values.forEach((value) => store.put(value));
  await txDone(tx);
  return values;
}

export async function remove(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  await txDone(tx);
}

export async function clearStore(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).clear();
  await txDone(tx);
}

export async function getSetting(key, fallback = null) {
  const record = await get("settings", key);
  return record ? record.value : fallback;
}

export async function setSetting(key, value) {
  return put("settings", { key, value });
}

export async function seedDefaultsIfNeeded(defaults) {
  const seeded = await getSetting("seeded", false);
  if (seeded) return;
  await bulkPut("templates", defaults.templates);
  await bulkPut("exerciseLibrary", defaults.exerciseLibrary);
  await bulkPut("settings", defaults.settings);
  await setSetting("seeded", true);
}

export async function exportAllData() {
  const data = {
    app: "Lifti",
    db: DB_NAME,
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    stores: {}
  };
  for (const store of STORES) {
    data.stores[store] = await getAll(store);
  }
  return data;
}

export async function importAllData(data) {
  if (!data || !data.stores) throw new Error("Backup file is missing store data.");
  const db = await openDB();
  const tx = db.transaction(STORES, "readwrite");
  for (const storeName of STORES) {
    const store = tx.objectStore(storeName);
    store.clear();
    const records = Array.isArray(data.stores[storeName]) ? data.stores[storeName] : [];
    records.forEach((record) => store.put(record));
  }
  await txDone(tx);
}
