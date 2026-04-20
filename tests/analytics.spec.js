import { test, expect } from './helpers/extension.js';
import { openExtensionPage, db } from './helpers/db.js';

async function isLoggedIn(page) {
  await page.goto('https://www.royalroad.com/home', { waitUntil: 'domcontentloaded' });
  const count = await page.locator('a[href*="/author-dashboard"]').count();
  return count > 0;
}

async function primeMyFictions(context) {
  const page = await context.newPage();
  await page.goto('https://www.royalroad.com/author-dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#rr-companion-root', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.close();
}

test.describe('analytics followers (requires login)', () => {
  test.beforeEach(async ({ context }) => {
    const probe = await context.newPage();
    const loggedIn = await isLoggedIn(probe);
    await probe.close();
    test.skip(!loggedIn, 'Not logged in to Royal Road. Run `npm run test:login` first.');
  });

  test('content script mounts on /author-dashboard/analytics/followers/<fictionId>', async ({ context, extensionId }) => {
    await primeMyFictions(context);

    const extPage = await openExtensionPage(context, extensionId);
    const fictions = (await db.getAll(extPage, 'myFictions')) || [];
    await extPage.close();
    test.skip(fictions.length === 0, 'No fictions in author dashboard — skipping analytics mount test.');

    const fictionId = fictions[0].fictionId;
    const page = await context.newPage();
    await page.goto(`https://www.royalroad.com/author-dashboard/analytics/followers/${fictionId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('#rr-followers-root')).toBeVisible({ timeout: 30_000 });
  });
});
