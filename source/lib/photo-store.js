(() => {
function createPhotoStore(indexedDb, appVersion) {
  const databaseName = 'SpaCoachPhotoDB';
  const storeName = 'testPhotos';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!indexedDb) { reject(new Error('IndexedDB is not available')); return; }
      const request = indexedDb.open(databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName, { keyPath:'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open photo database'));
    });
    return dbPromise;
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Photo database transaction failed'));
      transaction.onabort = () => reject(transaction.error || new Error('Photo database transaction aborted'));
    });
  }

  async function put(id, fullBlob, thumbBlob, at, metadata = {}) {
    if (!id || !fullBlob) return false;
    const database = await open();
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put({ id, fullBlob, thumbBlob:thumbBlob || fullBlob, at, version:appVersion, ...metadata });
    await transactionDone(transaction);
    return true;
  }

  async function get(id) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read saved photo'));
    });
  }

  async function getAll() {
    const database = await open();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a,b) => String(b.at || '').localeCompare(String(a.at || ''))));
      request.onerror = () => reject(request.error || new Error('Could not read saved photos'));
    });
  }

  async function remove(id) {
    const database = await open();
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    await transactionDone(transaction);
  }

  async function clear() {
    return replaceAll([]);
  }

  async function replaceAll(records) {
    const database = await open();
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    store.clear();
    records.forEach(record => store.put(record));
    await transactionDone(transaction);
  }

  return Object.freeze({ clear, get, getAll, put, remove, replaceAll });
}

globalThis.SpaPhotoStore = Object.freeze({ createPhotoStore });
})();
