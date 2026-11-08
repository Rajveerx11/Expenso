import { expect, test } from '@playwright/test';

test('Firefox completes authentication and responsive dashboard navigation', async ({ page }) => {
  const runId = Date.now();
  await page.goto('/signup');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Full Name').fill('Firefox Verifier');
  await page.getByLabel('Email').fill(`firefox.${runId}@expenso.test`);
  await page.locator('input[autocomplete="new-password"]').fill('Expenso-E2E-2026!');
  await expect(page.getByLabel('Full Name')).toHaveValue('Firefox Verifier');
  await expect(page.getByLabel('Email')).toHaveValue(`firefox.${runId}@expenso.test`);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.waitForURL(/\/onboarding$/);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.waitForURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: /Firefox/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'Expenses' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await page.getByRole('link', { name: 'Inbox' }).click();
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Browser notifications' })).toBeVisible();
});
