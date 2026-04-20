import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, test as base } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../..');
export const PROFILE_DIR = path.join(PROJECT_ROOT, '.test-profile');

export const test = base.extend({
  context: async ({}, use) => {
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
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const id = worker.url().split('/')[2];
    await use(id);
  },
});

export const expect = test.expect;
