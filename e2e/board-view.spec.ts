import { test, expect } from '@playwright/test';

test.describe('Board View', () => {
  test.skip(true, 'Requires authenticated session - enable when test auth is configured');

  test('renders board columns for each status', async ({ page }) => {
    await page.goto('/');

    const columns = ['Backlog', 'Todo', 'In progress', 'In review', 'Done'];
    for (const col of columns) {
      await expect(page.locator(`text=${col}`).first()).toBeVisible();
    }
  });

  test('can switch between board and list view', async ({ page }) => {
    await page.goto('/');

    // Switch to list view
    await page.click('button:has-text("List")');
    await expect(page.locator('table')).toBeVisible();

    // Switch back to board
    await page.click('button:has-text("Board")');
  });

  test('swimlane toggle works', async ({ page }) => {
    await page.goto('/');

    // Open swimlane selector
    await page.click('button:has-text("Swimlane")');
    await page.click('text=Priority');

    // Should show priority-based swimlanes
    await expect(page.locator('text=Urgent').first()).toBeVisible();
  });
});
