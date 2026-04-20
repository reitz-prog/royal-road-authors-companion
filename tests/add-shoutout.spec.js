import { test, expect } from './helpers/extension.js';
import { openExtensionPage, db, clearStore } from './helpers/db.js';

const STABLE_FICTION_ID = '25137';

async function isLoggedIn(page) {
  await page.goto('https://www.royalroad.com/home', { waitUntil: 'domcontentloaded' });
  return (await page.locator('a[href*="/author-dashboard"]').count()) > 0;
}

function addDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function findEmptyFutureDay(page) {
  for (let offset = 2; offset <= 20; offset++) {
    const iso = addDaysISO(offset);
    const cell = page.locator(`[data-date="${iso}"]`).first();
    if ((await cell.count()) === 0) continue;
    const occupied = await cell.locator('.rr-swap-card').count();
    if (occupied === 0) return { iso, cell };
  }
  return null;
}

test.describe('add shoutout (requires login, hits real Royal Road)', () => {
  test.beforeEach(async ({ context }) => {
    const probe = await context.newPage();
    const loggedIn = await isLoggedIn(probe);
    await probe.close();
    test.skip(!loggedIn, 'Not logged in to Royal Road. Run `npm run test:login` first.');
  });

  test('pastes a fiction URL, parses details, saves to storage', async ({ context, extensionId }) => {
    const extPage = await openExtensionPage(context, extensionId);
    await clearStore(extPage, 'shoutouts');
    await extPage.close();

    const page = await context.newPage();
    await page.goto('https://www.royalroad.com/author-dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#rr-companion-root')).toBeVisible({ timeout: 30_000 });

    const target = await findEmptyFutureDay(page);
    expect(target, 'expected at least one empty future day in the visible calendar').not.toBeNull();

    await target.cell.click();

    const textarea = page.locator('textarea.rr-modal-textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill(`<a href="https://www.royalroad.com/fiction/${STABLE_FICTION_ID}">Fiction</a>`);

    const saveBtn = page.getByRole('button', { name: /^Save$/ });
    await expect(saveBtn).toBeEnabled({ timeout: 30_000 });

    await expect(page.locator('.rr-author-fiction-large')).not.toHaveText(/^(Unknown|\s*)$/, { timeout: 30_000 });

    await saveBtn.click();

    const extPage2 = await openExtensionPage(context, extensionId);
    await expect
      .poll(async () => (await db.getAll(extPage2, 'shoutouts'))?.length ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const shoutouts = await db.getAll(extPage2, 'shoutouts');
    await extPage2.close();

    const saved = shoutouts.find((s) => String(s.fictionId) === STABLE_FICTION_ID);
    expect(saved, `expected shoutout with fictionId ${STABLE_FICTION_ID}`).toBeTruthy();
    expect(saved.fictionTitle, 'fictionTitle should be populated').toBeTruthy();
    expect(saved.authorName, 'authorName should be populated (covers recent parsing fix)').toBeTruthy();
    expect(saved.coverUrl, 'coverUrl should be populated (covers recent cover-extraction fix)').toBeTruthy();
  });
});
