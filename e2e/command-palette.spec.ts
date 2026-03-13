import { test, expect } from '@playwright/test';

test.describe('Command Palette', () => {
  test.skip(true, 'Requires authenticated session - enable when test auth is configured');

  test('search input accepts text and shows results', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Meta+k');

    const dialog = page.locator('[cmdk-dialog]');
    await expect(dialog).toBeVisible();

    // Type a search query
    await page.keyboard.type('test');

    // Should show search results or "no results" message
    await expect(dialog.locator('[cmdk-list]')).toBeVisible();
  });

  test('Escape closes command palette', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Meta+k');
    await expect(page.locator('[cmdk-dialog]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[cmdk-dialog]')).not.toBeVisible();
  });
});
