import { test, expect } from '@playwright/test';

test.describe('Keyboard Shortcuts', () => {
  test.skip(true, 'Requires authenticated session - enable when test auth is configured');

  test('Cmd+K opens command palette', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Meta+k');
    await expect(page.locator('[cmdk-dialog]')).toBeVisible();
  });

  test('c key opens create task modal', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('c');
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('Escape closes open modals', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('c');
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });
});
