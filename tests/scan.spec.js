import { test, expect } from './helpers/extension.js';

const STABLE_FICTION_ID = '25137';

async function isLoggedIn(page) {
  await page.goto('https://www.royalroad.com/home', { waitUntil: 'domcontentloaded' });
  return (await page.locator('a[href*="/author-dashboard"]').count()) > 0;
}

test.describe('scanner chapter-list parsing (requires login, hits real Royal Road)', () => {
  test.beforeEach(async ({ context }) => {
    const probe = await context.newPage();
    const loggedIn = await isLoggedIn(probe);
    await probe.close();
    test.skip(!loggedIn, 'Not logged in to Royal Road. Run `npm run test:login` first.');
  });

  test('parseChapterList extracts chapters from a live fiction page', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/offscreen.html`);

    expect(await page.evaluate(() => typeof window.__rrParsers?.parseChapterList)).toBe('function');

    const result = await page.evaluate(async (fictionId) => {
      const res = await fetch(`https://www.royalroad.com/fiction/${fictionId}`, {
        credentials: 'include',
      });
      const html = await res.text();
      return window.__rrParsers.parseChapterList(html, fictionId);
    }, STABLE_FICTION_ID);

    expect(result.fictionId).toBe(STABLE_FICTION_ID);
    expect(result.fictionTitle, 'fiction title should be parsed').toBeTruthy();
    expect(result.chapters.length, 'should extract at least one chapter via URL pattern').toBeGreaterThan(0);

    const sample = result.chapters[0];
    expect(sample.url).toMatch(new RegExp(`^https://www\\.royalroad\\.com/fiction/${STABLE_FICTION_ID}/[^/]+/chapter/\\d+`));
    expect(sample.title, 'chapter title should not be empty').toBeTruthy();
    expect(sample.title).not.toBe('Untitled');

    const hrefs = result.chapters.map((c) => c.url);
    expect(new Set(hrefs).size, 'chapters should be deduplicated').toBe(hrefs.length);
  });

  test('parseFictionDetails extracts title, cover, author, profileId from a live fiction page', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/offscreen.html`);

    const result = await page.evaluate(async (fictionId) => {
      const res = await fetch(`https://www.royalroad.com/fiction/${fictionId}`, {
        credentials: 'include',
      });
      const html = await res.text();
      return window.__rrParsers.parseFictionDetails(html, fictionId);
    }, STABLE_FICTION_ID);

    expect(result.fictionId).toBe(STABLE_FICTION_ID);
    expect(result.fictionTitle, 'title should be parsed').toBeTruthy();
    expect(result.fictionTitle).not.toBe('Unknown');
    expect(result.coverUrl, 'cover URL should be populated').toMatch(/^https?:\/\//);
    expect(result.authorName, 'author name should be populated').toBeTruthy();
    expect(result.profileId, 'profileId should be a numeric string').toMatch(/^\d+$/);
    expect(result.profileUrl, 'profile URL should match /profile/<id> pattern').toMatch(/\/profile\/\d+$/);
  });

  test('parseAvatarFromProfile extracts the real avatar CDN URL from a live profile page', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/offscreen.html`);

    const fictionResult = await page.evaluate(async (fictionId) => {
      const res = await fetch(`https://www.royalroad.com/fiction/${fictionId}`, {
        credentials: 'include',
      });
      return window.__rrParsers.parseFictionDetails(await res.text(), fictionId);
    }, STABLE_FICTION_ID);

    expect(fictionResult.profileUrl, 'need a profileUrl to fetch the profile page').toBeTruthy();

    const avatar = await page.evaluate(async (profileUrl) => {
      const res = await fetch(profileUrl, { credentials: 'include' });
      const html = await res.text();
      return window.__rrParsers.parseAvatarFromProfile(html);
    }, fictionResult.profileUrl);

    // avatar may legitimately be empty only if the author has the default anon avatar;
    // for a popular fiction like The Wandering Inn, the author does have a custom avatar.
    expect(avatar, 'avatar URL should point at the royalroadcdn CDN').toMatch(
      /^https:\/\/www\.royalroadcdn\.com\/public\/avatars\/avatar-\d+-[^"'\s)]+/
    );
  });
});
