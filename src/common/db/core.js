// IndexedDB Core - generic CRUD only
// 5 stores: contacts, fictions, shoutouts, myFictions, myCodes

const DB_NAME = 'rr-companion';
const DB_VERSION = 1;

let db = null;

/**
 * Open/initialize the database
 */
export async function openDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Contacts store
      if (!database.objectStoreNames.contains('contacts')) {
        const contacts = database.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
        contacts.createIndex('authorName', 'authorName', { unique: false });
        contacts.createIndex('profileUrl', 'profileUrl', { unique: false });
      }

      // Fictions store
      if (!database.objectStoreNames.contains('fictions')) {
        const fictions = database.createObjectStore('fictions', { keyPath: 'id', autoIncrement: true });
        fictions.createIndex('fictionId', 'fictionId', { unique: true });
        fictions.createIndex('contactId', 'contactId', { unique: false });
      }

      // Shoutouts store
      if (!database.objectStoreNames.contains('shoutouts')) {
        const shoutouts = database.createObjectStore('shoutouts', { keyPath: 'id', autoIncrement: true });
        shoutouts.createIndex('fictionId', 'fictionId', { unique: false });
      }

      // My Fictions store
      if (!database.objectStoreNames.contains('myFictions')) {
        const myFictions = database.createObjectStore('myFictions', { keyPath: 'id', autoIncrement: true });
        myFictions.createIndex('fictionId', 'fictionId', { unique: true });
      }

      // My Codes store
      if (!database.objectStoreNames.contains('myCodes')) {
        const myCodes = database.createObjectStore('myCodes', { keyPath: 'id', autoIncrement: true });
        myCodes.createIndex('fictionId', 'fictionId', { unique: false });
      }

      // Follower Data store (cached analytics)
      if (!database.objectStoreNames.contains('followerData')) {
        database.createObjectStore('followerData', { keyPath: 'fictionId' });
      }

      // Favorites Data store (cached analytics)
      if (!database.objectStoreNames.contains('favoritesData')) {
        database.createObjectStore('favoritesData', { keyPath: 'fictionId' });
      }
    };
  });
}

/**
 * Get all records from store
 */
export async function getAll(storeName) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get record by id
 */
export async function getById(storeName, id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get record by index
 */
export async function getByIndex(storeName, indexName, value) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.get(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save record (add or update)
 */
export async function save(storeName, data) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    const now = new Date().toISOString();
    const saveData = { ...data };

    if (saveData.id === undefined || saveData.id === null) {
      delete saveData.id;
      saveData.createdAt = now;
    }
    saveData.updatedAt = now;

    const request = saveData.id ? store.put(saveData) : store.add(saveData);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete record by id
 */
export async function deleteById(storeName, id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Upsert record (insert or update based on keyPath)
 * Use this for stores with custom keyPath (not auto-increment id)
 */
export async function upsert(storeName, data) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
