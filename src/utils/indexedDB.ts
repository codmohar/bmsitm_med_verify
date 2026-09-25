/**
 * DoseSure Dual-Tier IndexedDB & Server DB Client
 *
 * This client provides:
 * 1. Native browser IndexedDB caching (offline-first & sub-millisecond retrieval)
 * 2. Automatic synchronization with the server's './db' folder on disk
 * 3. Unified API so all patient, doctor, alert, and individual data is saved
 *    both in the browser IndexedDB AND centrally in the './db' directory files.
 */

const DB_NAME = 'DoseSure_IndexedDB';
const DB_VERSION = 1;

export const STORES = {
  PATIENTS: 'patients',
  DOCTORS: 'doctors',
  ALERTS: 'alerts',
  DOSES: 'doses',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open or initialize the browser IndexedDB instance
 */
export function openIndexedDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Patients store
      if (!db.objectStoreNames.contains(STORES.PATIENTS)) {
        const store = db.createObjectStore(STORES.PATIENTS, { keyPath: 'id' });
        store.createIndex('pillboxId', 'pillboxId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('authPin', 'authPin', { unique: false });
      }

      // Doctors store
      if (!db.objectStoreNames.contains(STORES.DOCTORS)) {
        const store = db.createObjectStore(STORES.DOCTORS, { keyPath: 'id' });
        store.createIndex('email', 'email', { unique: false });
      }

      // Alerts store
      if (!db.objectStoreNames.contains(STORES.ALERTS)) {
        const store = db.createObjectStore(STORES.ALERTS, { keyPath: 'id' });
        store.createIndex('patientId', 'patientId', { unique: false });
        store.createIndex('severity', 'severity', { unique: false });
        store.createIndex('isReviewed', 'isReviewed', { unique: false });
      }

      // Doses store
      if (!db.objectStoreNames.contains(STORES.DOSES)) {
        const store = db.createObjectStore(STORES.DOSES, { keyPath: 'id' });
        store.createIndex('patientId', 'patientId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

/**
 * Generic IndexedDB getAll helper
 */
export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] idbGetAll failed on store "${storeName}":`, err);
    return [];
  }
}

/**
 * Generic IndexedDB put helper
 */
export async function idbPut<T>(storeName: string, item: T): Promise<void> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] idbPut failed on store "${storeName}":`, err);
  }
}

/**
 * Generic IndexedDB bulk put helper
 */
export async function idbPutBulk<T>(storeName: string, items: T[]): Promise<void> {
  if (!items || !items.length) return;
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] idbPutBulk failed on store "${storeName}":`, err);
  }
}

// ========================================================
// DUAL-TIER SYNC: Server './db' folder <-> Browser IndexedDB
// ========================================================

/**
 * Fetch all data from server's './db' folder and sync into browser IndexedDB.
 * If offline, fall back to browser IndexedDB records.
 */
export async function syncDatabaseWithServer() {
  try {
    const res = await fetch('/api/db/all', { cache: 'no-cache' });
    if (res.ok) {
      const serverData = await res.json();

      // Cache all records into local browser IndexedDB
      if (serverData.patients && serverData.patients.length) {
        await idbPutBulk(STORES.PATIENTS, serverData.patients);
      }
      if (serverData.doctors && serverData.doctors.length) {
        await idbPutBulk(STORES.DOCTORS, serverData.doctors);
      }
      if (serverData.alerts && serverData.alerts.length) {
        await idbPutBulk(STORES.ALERTS, serverData.alerts);
      }
      if (serverData.doses && serverData.doses.length) {
        await idbPutBulk(STORES.DOSES, serverData.doses);
      }

      console.log('[DoseSure Sync] Synchronised server db/ folder into browser IndexedDB');
      return {
        online: true,
        patients: serverData.patients,
        doctors: serverData.doctors,
        alerts: serverData.alerts,
        doses: serverData.doses,
      };
    }
  } catch (err) {
    console.warn('[DoseSure Sync] Server unreachable, loading from browser IndexedDB:', err);
  }

  // Fallback to browser IndexedDB if offline or server loading
  const [patients, doctors, alerts, doses] = await Promise.all([
    idbGetAll(STORES.PATIENTS),
    idbGetAll(STORES.DOCTORS),
    idbGetAll(STORES.ALERTS),
    idbGetAll(STORES.DOSES),
  ]);

  return {
    online: false,
    patients,
    doctors,
    alerts,
    doses,
  };
}

/**
 * Save/update a patient to BOTH browser IndexedDB AND the server './db/patients.json' file
 */
export async function persistPatientRecord(patient: any) {
  // 1. Save to browser IndexedDB immediately
  await idbPut(STORES.PATIENTS, patient);

  // 2. Persist to server './db' folder on disk
  try {
    await fetch('/api/db/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patient),
    });
  } catch (err) {
    console.error('[DoseSure Sync] Failed saving patient to server db folder:', err);
  }
}

/**
 * Bulk save patients to BOTH browser IndexedDB AND the server './db' folder
 */
export async function persistPatientsBulk(patients: any[]) {
  // 1. Save to browser IndexedDB
  await idbPutBulk(STORES.PATIENTS, patients);

  // 2. Persist to server './db' folder on disk
  try {
    await fetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patients }),
    });
  } catch (err) {
    console.error('[DoseSure Sync] Failed syncing patients to server db folder:', err);
  }
}

/**
 * Save/update an alert to BOTH browser IndexedDB AND the server './db/alerts.json' file
 */
export async function persistAlertRecord(alert: any) {
  await idbPut(STORES.ALERTS, alert);

  try {
    await fetch('/api/db/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
  } catch (err) {
    console.error('[DoseSure Sync] Failed saving alert to server db folder:', err);
  }
}

/**
 * Bulk save alerts to BOTH browser IndexedDB AND the server './db' folder
 */
export async function persistAlertsBulk(alerts: any[]) {
  await idbPutBulk(STORES.ALERTS, alerts);

  try {
    await fetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alerts }),
    });
  } catch (err) {
    console.error('[DoseSure Sync] Failed syncing alerts to server db folder:', err);
  }
}

/**
 * Save/update a doctor profile to BOTH browser IndexedDB AND the server './db/doctors.json' file
 */
export async function persistDoctorRecord(doctor: any) {
  await idbPut(STORES.DOCTORS, doctor);

  try {
    await fetch('/api/db/doctors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doctor),
    });
  } catch (err) {
    console.error('[DoseSure Sync] Failed saving doctor to server db folder:', err);
  }
}

/**
 * Record a dose intake event to BOTH browser IndexedDB AND the server './db/doses.json' file
 */
export async function persistDoseRecord(dose: any) {
  await idbPut(STORES.DOSES, dose);

  try {
    await fetch('/api/db/doses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dose),
    });
  } catch (err) {
    console.error('[DoseSure Sync] Failed saving dose to server db folder:', err);
  }
}
