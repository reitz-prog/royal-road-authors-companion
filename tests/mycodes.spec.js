import { test, expect } from './helpers/extension.js';
import { openExtensionPage, db, clearStore } from './helpers/db.js';

async function isLoggedIn(page) {
  await page.goto('https://www.royalroad.com/home', { waitUntil: 'domcontentloaded' });
  return (await page.locator('a[href*="/author-dashboard"]').count()) > 0;
}

async function html5DragTo(page, source, target) {
  const s = await source.boundingBox();
  const t = await target.boundingBox();
  const sx = s.x + s.width / 2;
  const sy = s.y + s.height / 2;
  const tx = t.x + t.width / 2;
  const ty = t.y + t.height / 2;

  await source.hover();
  await page.mouse.down();
  await page.mouse.move(sx + 5, sy + 5, { steps: 2 });

  await source.evaluate((el) => {
    const dt = new DataTransfer();
    el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    window.__dragDT = dt;
  });
  await target.evaluate((el) => {
    el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: window.__dragDT }));
    el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.__dragDT }));
  });
  await page.mouse.move(tx, ty, { steps: 5 });
  await target.evaluate((el) => {
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__dragDT }));
    el.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: window.__dragDT }));
  });
  await page.mouse.up();
}

test.describe('My Shoutout Codes reorder (requires login)', () => {
  test.beforeEach(async ({ context }) => {
    const probe = await context.newPage();
    const loggedIn = await isLoggedIn(probe);
    await probe.close();
    test.skip(!loggedIn, 'Not logged in to Royal Road. Run `npm run test:login` first.');
  });

  test('drag reorder persists new order to storage', async ({ context, extensionId }) => {
    const extPage = await openExtensionPage(context, extensionId);
    await clearStore(extPage, 'myCodes');

    const seeded = [
      { code: '<a href="/fiction/1">A</a>', name: 'Alpha', fictionId: '1', order: 0 },
      { code: '<a href="/fiction/2">B</a>', name: 'Bravo', fictionId: '2', order: 1 },
      { code: '<a href="/fiction/3">C</a>', name: 'Charlie', fictionId: '3', order: 2 },
    ];
    for (const c of seeded) await db.save(extPage, 'myCodes', c);
    await extPage.close();

    const page = await context.newPage();
    await page.goto('https://www.royalroad.com/author-dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#rr-companion-root')).toBeVisible({ timeout: 30_000 });

    const items = page.locator('.rr-mycode-item');
    await expect(items).toHaveCount(3, { timeout: 15_000 });
    await expect(items.nth(0)).toContainText('Alpha');
    await expect(items.nth(2)).toContainText('Charlie');

    await html5DragTo(page, items.nth(0), items.nth(2));

    await expect
      .poll(
        async () => {
          const names = await page.locator('.rr-mycode-item .rr-mycode-name').allTextContents();
          return names[names.length - 1];
        },
        { timeout: 10_000 }
      )
      .toBe('Alpha');

    const extPage2 = await openExtensionPage(context, extensionId);
    const stored = await db.getAll(extPage2, 'myCodes');
    await extPage2.close();
    const byOrder = [...stored].sort((a, b) => a.order - b.order).map((c) => c.name);
    expect(byOrder[byOrder.length - 1]).toBe('Alpha');
  });
});
