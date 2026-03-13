import { test, expect } from '@playwright/test';

// Note: These E2E tests require a running app with authentication.
// They serve as smoke tests for the critical user paths.
// For CI, you'd need test credentials or auth bypass.

test.describe('Task CRUD', () => {
  test.skip(true, 'Requires authenticated session - enable when test auth is configured');

  test('can create a task via modal', async ({ page }) => {
    await page.goto('/');
    // Press 'c' to open create modal
    await page.keyboard.press('c');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Fill in task title
    await page.fill('input[placeholder*="title"]', 'E2E Test Task');
    await page.click('button:has-text("Create")');

    // Verify task appears
    await expect(page.locator('text=E2E Test Task')).toBeVisible();
  });

  test('can open task detail panel', async ({ page }) => {
    await page.goto('/');
    // Click on a task
    await page.locator('[data-task-index="0"]').click();
    await expect(page.locator('[data-testid="task-detail-panel"]')).toBeVisible();
  });

  test('can change task status', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-task-index="0"]').click();

    // Click status dropdown
    await page.click('button:has-text("Todo")');
    await page.click('text=In progress');

    await expect(page.locator('text=In progress')).toBeVisible();
  });
});
