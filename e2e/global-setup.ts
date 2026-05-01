import { chromium, type FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const STORAGE_PATH = path.resolve(__dirname, 'storageState.json');
const TEST_USER_EMAIL = process.env.QA_TEST_EMAIL ?? `qa-bot+${Date.now()}@useatlas.test`;
const TEST_USER_PASSWORD = process.env.QA_TEST_PASSWORD ?? 'QaBotPassword!2026';
const TEST_USER_NAME = process.env.QA_TEST_NAME ?? 'QA Bot';

async function globalSetup(_config: FullConfig) {
  if (fs.existsSync(STORAGE_PATH) && process.env.QA_REUSE_STATE !== 'false') {
    return;
  }

  const baseURL = 'http://localhost:3000';
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto('/login');
  if (!page.url().includes('/login')) {
    await context.storageState({ path: STORAGE_PATH });
    await browser.close();
    return;
  }

  await page.goto('/signup');
  await page.locator('input[type="email"]').fill(TEST_USER_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_USER_PASSWORD);
  const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
  if (await nameInput.count()) {
    await nameInput.fill(TEST_USER_NAME);
  }
  await page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Create")').first().click();

  await page.waitForURL((url) => !url.pathname.startsWith('/signup') && !url.pathname.startsWith('/login'), { timeout: 30_000 }).catch(async () => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(TEST_USER_EMAIL);
    await page.locator('input[type="password"]').first().fill(TEST_USER_PASSWORD);
    await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  });

  await context.storageState({ path: STORAGE_PATH });
  await browser.close();

  fs.writeFileSync(
    path.resolve(__dirname, '.qa-test-user.json'),
    JSON.stringify({ email: TEST_USER_EMAIL, name: TEST_USER_NAME }, null, 2)
  );
}

export default globalSetup;
