import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const PROFILE_DIR = path.join(PROJECT_ROOT, '.test-profile');

console.log('Opening Royal Road login page in the test profile.');
console.log('Log in, then close the browser window to save your session.');
console.log(`Profile dir: ${PROFILE_DIR}`);

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: [
    `--disable-extensions-except=${PROJECT_ROOT}`,
    `--load-extension=${PROJECT_ROOT}`,
    '--disable-blink-features=AutomationControlled',
  ],
  ignoreDefaultArgs: ['--enable-automation'],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://www.royalroad.com/account/login');

await new Promise((resolve) => {
  const done = () => {
    if (context.pages().length === 0) resolve();
  };
  context.on('page', (p) => p.on('close', done));
  context.pages().forEach((p) => p.on('close', done));
  context.on('close', resolve);
});

await context.close().catch(() => {});
console.log('Session saved. You can now run `npm test`.');
process.exit(0);
