import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const password = 'Expenso-E2E-2026!';

async function expectTouchTarget(page: Page, accessibleName: string) {
  const box = await page.getByRole('button', { name: accessibleName }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(43.9);
  expect(box!.height).toBeGreaterThanOrEqual(43.9);
}

async function signUp(page: Page, email: string) {
  await page.goto('/signup');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('main')).toHaveCount(1);
  await page.evaluate(() => localStorage.setItem('expenso.push-subscription.v1', JSON.stringify({
    id: '00000000-0000-4000-8000-000000000099',
    userId: '00000000-0000-4000-8000-000000000098',
  })));
  await page.getByLabel('Full Name').fill('Responsive Tester');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill(password);
  await page.getByLabel('Full Name').fill('Responsive Tester');
  await expect(page.getByLabel('Full Name')).toHaveValue('Responsive Tester');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.waitForURL(/\/onboarding$/);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('expenso.push-subscription.v1'))).toBeNull();
  await page.getByLabel('Display Name').fill('Responsive Tester');
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.waitForURL(/\/dashboard$/);
}

test('responsive widths, 200% scaling, reduced motion, landmarks, and WCAG scan', async ({ page, browserName }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('main')).toHaveCount(1);
  const missingEmail = `missing.${browserName}.${Date.now()}@expenso.test`;
  await page.getByLabel('Email').fill(missingEmail);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await expectTouchTarget(page, 'Show password');
  await page.getByLabel('Email').fill(missingEmail);
  await expect(page.getByLabel('Email')).toHaveValue(missingEmail);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /invalid email|email or password is incorrect/i })).toBeVisible();
  const authAccessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(authAccessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);

  await signUp(page, `responsive.${browserName}.${Date.now()}@expenso.test`);

  await page.goto('/expenses');
  await expectTouchTarget(page, 'Previous month');
  await expectTouchTarget(page, 'Next month');
  await page.goto('/expenses/new?type=expense');
  await expect(page.getByRole('group', { name: 'Transaction Type', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Category' })).toBeVisible();
  await page.goto('/groups/new');
  await expect(page.getByRole('textbox', { name: 'Add Members' })).toBeVisible();
  await expectTouchTarget(page, 'Add member');
  const chipEmail = `chip.${browserName}@expenso.test`;
  await page.getByPlaceholder('member@example.com').fill(chipEmail);
  await page.getByRole('button', { name: 'Add member' }).click();
  await expectTouchTarget(page, `Remove ${chipEmail}`);
  const groupFormAccessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(groupFormAccessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);

  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 1000 ? 900 : 800 });
    await page.goto('/dashboard');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).filter({ visible: true })).toHaveCount(1);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  if (browserName === 'webkit') await skipLink.focus();
  else await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const refreshedDashboard = page.waitForResponse((response) => response.url().includes('/api/v1/dashboard?') && response.request().method() === 'GET');
  await page.getByRole('button', { name: 'Refresh dashboard' }).click();
  expect((await refreshedDashboard).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Refresh dashboard' })).toBeEnabled();

  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto('/profile');
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
  const zoomedLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    mainRight: document.querySelector('main')?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
  }));
  expect(zoomedLayout.scrollWidth).toBeLessThanOrEqual(zoomedLayout.innerWidth + 1);
  expect(zoomedLayout.mainRight).toBeLessThanOrEqual(zoomedLayout.innerWidth + 1);
  await page.evaluate(() => { document.body.style.zoom = ''; });
  const profileAccessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(profileAccessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard');
  const motionDurationMs = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'animate-slideUp';
    document.body.append(probe);
    const duration = getComputedStyle(probe).animationDuration;
    probe.remove();
    return duration.endsWith('ms') ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
  });
  expect(motionDurationMs).toBeLessThanOrEqual(0.011);

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);

  await page.goto('/definitely-not-an-expenso-route');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.locator('#main-content')).toHaveCount(1);
});
