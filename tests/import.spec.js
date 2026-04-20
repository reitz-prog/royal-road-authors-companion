import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { test, expect } from './helpers/extension.js';
import { openExtensionPage, db, clearStore } from './helpers/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_EXPORT = path.join(__dirname, 'fixtures', 'shoutouts.xlsx');

async function isLoggedIn(page) {
  await page.goto('https://www.royalroad.com/home', { waitUntil: 'domcontentloaded' });
  return (await page.locator('a[href*="/author-dashboard"]').count()) > 0;
}

async function cancelAnyRunningImport(extPage) {
  await extPage.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'cancelImport' }, () => resolve());
      })
  );
}

async function sendStartImport(extPage, workbookData) {
  return extPage.evaluate(
    (workbookData) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'startImport', workbookData }, (response) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (response?.started) resolve(response);
          else reject(new Error(response?.reason || 'startImport failed'));
        });
      }),
    workbookData
  );
}

async function pollImportComplete(extPage, { timeout = 120_000, pollMs = 500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await extPage.evaluate(
      () =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'getImportState' }, (response) => resolve(response));
        })
    );
    if (state?.status !== 'importing') return state;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Import did not complete within ${timeout}ms`);
}

function fileToWorkbookData(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  return {
    sheets: wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name]),
    })),
  };
}

test.describe('xlsx import (requires login, hits real Royal Road)', () => {
  test.beforeEach(async ({ context }) => {
    const probe = await context.newPage();
    const loggedIn = await isLoggedIn(probe);
    await probe.close();
    test.skip(!loggedIn, 'Not logged in to Royal Road. Run `npm run test:login` first.');
  });

  test('[tier 1] imports a synthetic workbook via background message', async ({ context, extensionId }) => {
    const extPage = await openExtensionPage(context, extensionId);
    await cancelAnyRunningImport(extPage);
    await clearStore(extPage, 'shoutouts');

    const workbookData = {
      sheets: [
        {
          name: 'Unscheduled',
          rows: [
            { Code: '<a href="https://www.royalroad.com/fiction/25137">Wandering Inn</a>', Date: '' },
            { Code: '<a href="https://www.royalroad.com/fiction/36049">Primal Hunter</a>', Date: '' },
          ],
        },
      ],
    };

    await sendStartImport(extPage, workbookData);
    const state = await pollImportComplete(extPage, { timeout: 60_000 });

    expect(state?.status, 'import should finish (not stay importing)').not.toBe('importing');
    expect(state?.imported ?? 0, 'both rows should import').toBeGreaterThanOrEqual(2);

    const shoutouts = (await db.getAll(extPage, 'shoutouts')) || [];
    const byFictionId = new Map(shoutouts.map((s) => [String(s.fictionId), s]));
    expect(byFictionId.has('25137'), 'shoutout for 25137 should exist').toBeTruthy();
    expect(byFictionId.has('36049'), 'shoutout for 36049 should exist').toBeTruthy();

    await extPage.close();
  });

  test('[tier 2] imports the real export fixture (if present)', async ({ context, extensionId }) => {
    test.skip(
      !fs.existsSync(REAL_EXPORT),
      `No fixture at ${REAL_EXPORT}. Drop a real export there to run this tier.`
    );
    test.setTimeout(15 * 60_000);

    const workbookData = fileToWorkbookData(REAL_EXPORT);
    const totalRows = workbookData.sheets.reduce((n, s) => n + s.rows.length, 0);
    expect(totalRows, 'fixture workbook must have rows').toBeGreaterThan(0);

    const extPage = await openExtensionPage(context, extensionId);
    await cancelAnyRunningImport(extPage);
    await clearStore(extPage, 'shoutouts');

    await sendStartImport(extPage, workbookData);
    const state = await pollImportComplete(extPage, { timeout: 10 * 60_000, pollMs: 1000 });

    expect(state?.status, 'import should finish').not.toBe('importing');
    expect(state?.imported ?? 0, 'at least one row should import').toBeGreaterThan(0);

    const shoutouts = (await db.getAll(extPage, 'shoutouts')) || [];
    expect(shoutouts.length, 'storage should have imported shoutouts').toBeGreaterThan(0);

    await extPage.close();
  });
});
