import { test, expect } from './helpers/extension.js';

async function isLoggedIn(page) {
  await page.goto('https://www.royalroad.com/home', { waitUntil: 'domcontentloaded' });
  const dashboardLinks = await page.locator('a[href*="/author-dashboard"]').count();
  return dashboardLinks > 0;
}

test.describe('author dashboard (requires login)', () => {
  test.beforeEach(async ({ context }) => {
    const probe = await context.newPage();
    const loggedIn = await isLoggedIn(probe);
    await probe.close();
    test.skip(!loggedIn, 'Not logged in to Royal Road. Run `npm run test:login` first.');
  });

  test('content script mounts on /author-dashboard', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://www.royalroad.com/author-dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#rr-companion-root')).toBeVisible({ timeout: 30_000 });
  });

  test('styles are injected', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://www.royalroad.com/author-dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#rr-companion-styles')).toHaveCount(1, { timeout: 30_000 });
  });
});
