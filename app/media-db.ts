const DB_NAME = 'vores-camping-media';
const STORE_NAME = 'media';
const STATE_STORE_NAME = 'state';
const PENDING_IMPORT_KEY = 'pending-import';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      if (!request.result.objectStoreNames.contains(STATE_STORE_NAME)) request.result.createObjectStore(STATE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putMediaBlob(id: string, blob: Blob) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(blob, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function getMediaBlob(id: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  const result = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

export async function deleteMediaBlob(id: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function deleteAllMedia() {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, STATE_STORE_NAME], 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.objectStore(STATE_STORE_NAME).delete(PENDING_IMPORT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function replaceAllMedia(items: { id: string; blob: Blob }[], pendingData: string) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, STATE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      items.forEach((item) => store.put(item.blob, item.id));
      transaction.objectStore(STATE_STORE_NAME).put(pendingData, PENDING_IMPORT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Medieudskiftningen blev afbrudt.'));
    });
  } finally {
    database.close();
  }
}

export async function getPendingImport(): Promise<string | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise<string | undefined>((resolve, reject) => {
      const request = database.transaction(STATE_STORE_NAME, 'readonly').objectStore(STATE_STORE_NAME).get(PENDING_IMPORT_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function clearPendingImport() {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STATE_STORE_NAME, 'readwrite');
      transaction.objectStore(STATE_STORE_NAME).delete(PENDING_IMPORT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
