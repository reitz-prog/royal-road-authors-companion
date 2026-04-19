// Database Proxy - Content scripts use this to access IndexedDB via background messaging

function sendDbMessage(type, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success) {
        resolve(response.data !== undefined ? response.data : response.id);
      } else {
        reject(new Error(response?.error || 'Unknown error'));
      }
    });
  });
}

// ============ GENERIC OPERATIONS ============

export function getAll(storeName) {
  return sendDbMessage('db:getAll', { storeName });
}

export function getById(storeName, id) {
  return sendDbMessage('db:getById', { storeName, id });
}

export function getByIndex(storeName, indexName, value) {
  return sendDbMessage('db:getByIndex', { storeName, indexName, value });
}

export function save(storeName, data) {
  return sendDbMessage('db:save', { storeName, data });
}

export function deleteById(storeName, id) {
  return sendDbMessage('db:deleteById', { storeName, id });
}

export function upsert(storeName, data) {
  return sendDbMessage('db:upsert', { storeName, data });
}

export function clearAll() {
  return sendDbMessage('db:clearAll');
}

// openDB is not needed in proxy - background handles DB initialization
export function openDB() {
  return Promise.resolve();
}
