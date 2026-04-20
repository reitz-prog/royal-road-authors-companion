export async function openExtensionPage(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  return page;
}

async function dbCall(extPage, type, payload = {}) {
  return extPage.evaluate(
    ({ type, payload }) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, ...payload }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response.data !== undefined ? response.data : response.id);
          } else {
            reject(new Error(response?.error || `${type} failed`));
          }
        });
      }),
    { type, payload }
  );
}

export const db = {
  getAll: (p, storeName) => dbCall(p, 'db:getAll', { storeName }),
  save: (p, storeName, data) => dbCall(p, 'db:save', { storeName, data }),
  deleteById: (p, storeName, id) => dbCall(p, 'db:deleteById', { storeName, id }),
};

export async function clearStore(extPage, storeName) {
  const rows = (await db.getAll(extPage, storeName)) || [];
  for (const row of rows) {
    if (row?.id != null) await db.deleteById(extPage, storeName, row.id);
  }
}
