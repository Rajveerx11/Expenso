import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const evidenceDir = path.resolve(process.cwd(), '../../artifacts/evidence');
const iconFixture = path.resolve(process.cwd(), 'public/icons/icon-192.png');
const password = 'Expenso-E2E-2026!';

function evidence(name: string) {
  return path.join(evidenceDir, name);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: evidence(name), fullPage: true });
}

async function browserData<T>(page: Page, apiPath: string): Promise<T> {
  return page.evaluate(async (pathName) => {
    const response = await fetch(pathName, { credentials: 'same-origin', cache: 'no-store' });
    const payload = await response.json() as { data?: unknown; error?: { message?: string } };
    if (!response.ok || payload.data === undefined) {
      throw new Error(payload.error?.message ?? `Request failed with ${response.status}.`);
    }
    return payload.data as T;
  }, apiPath);
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'interactive control must have a visible hit target').not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function expectNoSeriousAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);
}

async function simulateUpiAppReturn(page: Page) {
  await page.getByRole('link', { name: 'Open UPI App' }).evaluate((element) => {
    element.addEventListener('click', (event) => event.preventDefault(), { once: true });
    (element as HTMLElement).click();
  });
  await expect(page.getByText('Complete payment in your UPI app')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('heading', { name: 'Did you complete this payment?' })).toBeVisible();
}

async function addGroupExpense(page: Page, groupUrl: string, input: {
  title: string;
  amount: string;
  splitType?: 'equal' | 'exact' | 'percentage';
  exactShares?: Record<string, string>;
  percentages?: Record<string, string>;
}) {
  await page.goto(`${groupUrl}/expenses/new`);
  await page.waitForLoadState('networkidle');
  await page.locator('input#group-expense-amount').fill(input.amount);
  await page.getByLabel('Title').fill(input.title);
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  if (input.splitType === 'exact') {
    await page.getByRole('button', { name: 'Exact', exact: true }).click();
    for (const [member, value] of Object.entries(input.exactShares ?? {})) {
      await page.getByLabel(`${member} exact share`).fill(value);
    }
  }
  if (input.splitType === 'percentage') {
    await page.getByRole('button', { name: '%', exact: true }).click();
    for (const [member, value] of Object.entries(input.percentages ?? {})) {
      await page.getByLabel(`${member} percentage share`).fill(value);
    }
  }
  await page.getByRole('button', { name: 'Add Expense' }).click();
  await expect(page.getByRole('status')).toContainText('Expense added');
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/expenses\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: input.title })).toBeVisible();
  return page.url();
}

async function groupBalance(page: Page, groupId: string) {
  const balances = await browserData<Array<{ balance: string; direction: string }>>(page, `/api/v1/groups/${groupId}/balances`);
  expect(balances).toHaveLength(1);
  return balances[0];
}

async function signUp(page: Page, user: { name: string; email: string; upiId: string }) {
  await page.goto('/signup');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Full Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.locator('input[autocomplete="new-password"]').fill(password);
  await expect(page.getByLabel('Full Name')).toHaveValue(user.name);
  await expect(page.getByLabel('Email')).toHaveValue(user.email);
  await expect(page.locator('input[autocomplete="new-password"]')).toHaveValue(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.waitForURL(/\/onboarding$/);
  await page.getByLabel('Display Name').fill(user.name);
  await page.getByLabel('UPI ID').fill(user.upiId);
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.waitForURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: new RegExp(user.name.split(' ')[0]) })).toBeVisible();
}

async function submitLogin(page: Page, email: string) {
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await expect(page.getByLabel('Email')).toHaveValue(email);
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveValue(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

async function addPersonalTransaction(page: Page, input: { type: 'income' | 'expense'; title: string; amount: string; category: string }) {
  await page.goto(`/expenses/new?type=${input.type}`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="number"]').first().fill(input.amount);
  await page.getByLabel('Title').fill(input.title);
  await page.getByRole('button', { name: input.category, exact: true }).click();
  await expect(page.getByLabel('Title')).toHaveValue(input.title);
  await expect(page.getByRole('button', { name: input.category, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: input.type === 'income' ? 'Add Income' : 'Add Expense' }).click();
  await expect(page.getByRole('status')).toContainText(input.type === 'income' ? 'Income added' : 'Expense added');
  await page.waitForURL(/\/dashboard$/);
}

async function closeWithEvidence(context: BrowserContext) {
  await context.close();
}

function captureBrowserSecurityErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && /content security policy|refused to (connect|load|apply)/i.test(text)) {
      errors.push(`console: ${text}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (['font', 'stylesheet'].includes(request.resourceType())) {
      errors.push(`requestfailed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`);
    }
  });
}

test('complete two-user finance, group, settlement, inbox, upload, authorization, and responsive flow', async ({ browser }) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const runId = `${Date.now()}-${test.info().retry}`;
  const alice = { name: 'Alice Ledger', email: `alice.${runId}@expenso.test`, upiId: 'alice@upi' };
  const bob = { name: 'Bob Splitter', email: `bob.${runId}@expenso.test`, upiId: 'bob@upi' };
  const groupName = `Goa Ledger ${runId}`;

  const aliceContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: evidenceDir, size: { width: 1280, height: 800 } },
  });
  const bobContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: evidenceDir, size: { width: 390, height: 844 } },
  });
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();
  const browserSecurityErrors: string[] = [];
  captureBrowserSecurityErrors(alicePage, browserSecurityErrors);
  captureBrowserSecurityErrors(bobPage, browserSecurityErrors);

  try {
    await signUp(alicePage, alice);
    expect(await alicePage.evaluate(() => document.cookie)).not.toMatch(/(?:^|;\s*)sb-/);
    const activeMonth = await alicePage.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    await screenshot(alicePage, '01-alice-dashboard-desktop.png');
    await signUp(bobPage, bob);
    await screenshot(bobPage, '02-bob-dashboard-mobile.png');

    await addPersonalTransaction(alicePage, { type: 'income', title: 'Consulting Income', amount: '5000.00', category: 'Freelance' });
    await addPersonalTransaction(alicePage, { type: 'expense', title: 'Coffee', amount: '125.50', category: 'Food' });
    await alicePage.goto('/expenses');
    await expect(alicePage.getByText('Consulting Income')).toBeVisible();
    await expect(alicePage.getByText('Coffee', { exact: true })).toBeVisible();
    await screenshot(alicePage, '03-personal-ledger-live.png');

    const dashboard = await browserData<{
      month: string; monthlyIncome: string; monthlyExpenses: string; monthlyNet: string;
    }>(alicePage, `/api/v1/dashboard?month=${activeMonth}`);
    expect(dashboard).toMatchObject({
      month: activeMonth, monthlyIncome: '5000.00', monthlyExpenses: '125.50', monthlyNet: '4874.50',
    });
    const analytics = await browserData<{
      monthlyIncome: string; monthlyExpenses: string; monthlyNet: string;
      lifetimeIncome: string; lifetimeExpenses: string; lifetimeNet: string;
      categoryBreakdown: Array<{ category: string; amount: string }>;
    }>(alicePage, `/api/v1/expenses/analytics?month=${activeMonth}`);
    expect(analytics).toMatchObject({
      monthlyIncome: '5000.00', monthlyExpenses: '125.50', monthlyNet: '4874.50',
      lifetimeIncome: '5000.00', lifetimeExpenses: '125.50', lifetimeNet: '4874.50',
    });
    expect(analytics.categoryBreakdown).toContainEqual(expect.objectContaining({ category: 'Food', amount: '125.50' }));

    await alicePage.getByText('Coffee', { exact: true }).click();
    await alicePage.waitForURL(/\/expenses\/[0-9a-f-]{36}$/);
    const personalExpenseUrl = alicePage.url();
    await alicePage.getByRole('button', { name: 'Edit' }).click();
    await alicePage.getByLabel('Title').fill('Coffee with client');
    await alicePage.getByRole('button', { name: 'Save' }).click();
    await expect(alicePage.getByRole('heading', { name: 'Coffee with client' })).toBeVisible();

    await bobPage.goto(personalExpenseUrl);
    await expect(bobPage.getByText(/not found|could not|access/i)).toBeVisible();

    await alicePage.reload();
    await expect(alicePage.getByRole('heading', { name: 'Coffee with client' })).toBeVisible();
    await alicePage.goto('/expenses');
    await expect(alicePage.getByRole('heading', { name: 'Transactions' })).toBeVisible();
    await alicePage.goBack();
    await expect(alicePage.getByRole('heading', { name: 'Coffee with client' })).toBeVisible();
    await alicePage.goForward();
    await expect(alicePage.getByRole('heading', { name: 'Transactions' })).toBeVisible();
    await alicePage.goBack();
    await alicePage.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(alicePage.getByRole('dialog')).toBeVisible();
    await expect(alicePage.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await alicePage.keyboard.press('Shift+Tab');
    await expect(alicePage.getByRole('button', { name: 'Delete', exact: true }).last()).toBeFocused();
    await alicePage.keyboard.press('Tab');
    await expect(alicePage.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await alicePage.keyboard.press('Escape');
    await expect(alicePage.getByRole('dialog')).toBeHidden();
    await expect(alicePage.getByRole('button', { name: 'Delete', exact: true }).first()).toBeFocused();
    await alicePage.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await alicePage.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await alicePage.waitForURL(/\/expenses$/);
    await expect(alicePage.getByText('Coffee with client', { exact: true })).toBeHidden();

    await alicePage.goto('/profile/edit');
    await alicePage.waitForLoadState('networkidle');
    const avatarButton = alicePage.getByRole('button', { name: 'Change avatar' });
    await expectTouchTarget(avatarButton);
    const avatarInput = alicePage.locator('input[type="file"]');
    const invalidTypeResponse = alicePage.waitForResponse((response) => response.url().endsWith('/api/v1/me/avatar/upload-ticket') && response.request().method() === 'POST');
    await avatarInput.setInputFiles({ name: 'not-an-image.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    expect((await invalidTypeResponse).status()).toBe(422);
    await expect(alicePage.locator('p[role="alert"]')).toContainText('expected one of');
    const oversizedResponse = alicePage.waitForResponse((response) => response.url().endsWith('/api/v1/me/avatar/upload-ticket') && response.request().method() === 'POST');
    await avatarInput.setInputFiles({ name: 'oversized.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1) });
    expect((await oversizedResponse).status()).toBe(422);
    await expect(alicePage.locator('p[role="alert"]')).toContainText(/size|bytes|large|big/i);
    await avatarInput.setInputFiles(iconFixture);
    await expect(alicePage.getByRole('main').getByRole('img', { name: 'Alice Ledger' })).toBeVisible();
    await alicePage.getByLabel('Full Name').fill('Alice Ledger Updated');
    await alicePage.getByRole('button', { name: 'Save Changes' }).click();
    await expect(alicePage.getByRole('status')).toContainText('Profile updated');
    await alicePage.waitForURL((url) => !url.pathname.endsWith('/profile/edit'));
    await expect(alicePage.getByRole('complementary').getByText('Alice Ledger Updated', { exact: true })).toBeVisible();

    await alicePage.goto('/groups/new');
    await alicePage.waitForLoadState('networkidle');
    await alicePage.getByLabel('Group Name').fill(groupName);
    await alicePage.getByLabel('Description').fill('Two-user verified travel ledger');
    await alicePage.locator('input[type="file"]').setInputFiles(iconFixture);
    const memberInput = alicePage.getByPlaceholder('member@example.com');
    await memberInput.fill(bob.email);
    await memberInput.press('Enter');
    await expect(alicePage.getByText(bob.email, { exact: true })).toBeVisible();
    await alicePage.getByRole('button', { name: 'Create Group' }).click();
    await alicePage.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
    const groupUrl = alicePage.url();
    const groupId = groupUrl.split('/').at(-1)!;
    await alicePage.reload();
    await expect(alicePage.getByRole('heading', { name: groupName, level: 2 })).toBeVisible();
    await screenshot(alicePage, '04-group-created-with-image.png');

    await bobPage.goto('/groups');
    await expect(bobPage.getByText(groupName, { exact: true })).toBeVisible();

    await bobPage.goto(`${groupUrl}/settings`);
    await expect(bobPage.getByText('Only group admins can change group settings.')).toBeVisible();

    await addGroupExpense(alicePage, groupUrl, { title: 'Trip Dinner', amount: '120.00' });
    await screenshot(alicePage, '05-shared-expense-splits.png');

    const exactExpenseUrl = await addGroupExpense(alicePage, groupUrl, {
      title: 'Exact Taxi', amount: '30.00', splitType: 'exact',
      exactShares: { 'Alice Ledger Updated': '10.00', 'Bob Splitter': '20.00' },
    });
    const exactDetail = await browserData<{ splits: Array<{ userName: string; owedAmount: string }> }>(
      alicePage, new URL(exactExpenseUrl).pathname.replace('/groups/', '/api/v1/groups/'),
    );
    expect(exactDetail.splits).toEqual(expect.arrayContaining([
      expect.objectContaining({ userName: 'Alice Ledger Updated', owedAmount: '10.00' }),
      expect.objectContaining({ userName: 'Bob Splitter', owedAmount: '20.00' }),
    ]));

    const percentageExpenseUrl = await addGroupExpense(alicePage, groupUrl, {
      title: 'Rounding Snacks', amount: '10.01', splitType: 'percentage',
      percentages: { 'Alice Ledger Updated': '33.3333', 'Bob Splitter': '66.6667' },
    });
    const percentageDetail = await browserData<{ splits: Array<{ userName: string; owedAmount: string }> }>(
      alicePage, new URL(percentageExpenseUrl).pathname.replace('/groups/', '/api/v1/groups/'),
    );
    expect(percentageDetail.splits).toEqual(expect.arrayContaining([
      expect.objectContaining({ userName: 'Alice Ledger Updated', owedAmount: '3.34' }),
      expect.objectContaining({ userName: 'Bob Splitter', owedAmount: '6.67' }),
    ]));

    await bobPage.goto(groupUrl);
    const balanceBeforeTemporary = await groupBalance(bobPage, groupId);
    const temporaryExpenseUrl = await addGroupExpense(alicePage, groupUrl, { title: 'Temporary Reversal', amount: '20.00' });
    expect(await groupBalance(bobPage, groupId)).toMatchObject({
      balance: (Number(balanceBeforeTemporary.balance) - 10).toFixed(2), direction: 'you_owe',
    });
    await alicePage.goto('/expenses');
    await expect(alicePage.getByText('Temporary Reversal', { exact: true })).toBeVisible();
    await alicePage.goto(temporaryExpenseUrl);
    await alicePage.getByRole('button', { name: 'Delete Expense' }).click();
    await alicePage.getByRole('dialog').getByRole('button', { name: 'Delete Expense' }).click();
    await alicePage.waitForURL(new RegExp(`/groups/${groupId}$`));
    expect(await groupBalance(bobPage, groupId)).toEqual(balanceBeforeTemporary);
    await alicePage.goto('/expenses');
    await expect(alicePage.getByText('Temporary Reversal', { exact: true })).toBeHidden();

    await alicePage.goto(groupUrl);
    await alicePage.getByRole('button', { name: 'Members' }).click();
    const removeBob = alicePage.getByRole('button', { name: 'Remove Bob Splitter' });
    await expectTouchTarget(removeBob);
    await removeBob.click();
    await alicePage.getByRole('dialog').getByRole('button', { name: 'Remove Member' }).click();
    await expect(alicePage.getByRole('alert').filter({ hasText: 'Settle this member’s balance before removing them.' })).toBeVisible();
    await alicePage.goto(`${groupUrl}/settings`);
    await expectTouchTarget(alicePage.getByRole('button', { name: 'Change group photo' }));
    await alicePage.getByRole('button', { name: 'Delete Group' }).click();
    await alicePage.getByRole('dialog').getByRole('button', { name: 'Delete Group' }).click();
    await expect(alicePage.getByRole('alert').filter({ hasText: 'This group has financial history and must be retained.' })).toBeVisible();

    await alicePage.goto('/notifications');
    await expect(alicePage.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();

    await bobPage.goto(groupUrl);
    await bobPage.getByRole('button', { name: 'Balances' }).click();
    await expect(bobPage.getByLabel('Your group balances').getByText(/^You owe ₹/)).toBeVisible();
    const settleLink = bobPage.getByRole('link', { name: /Settle Up/ });
    await expectTouchTarget(settleLink);
    await settleLink.click();
    await expect(bobPage.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
    await expect(bobPage.getByText('Outstanding balance')).toBeVisible();
    await bobPage.getByLabel('Amount to Pay').fill('99999.00');
    await bobPage.getByRole('button', { name: 'Payment Options' }).click();
    const settlementAmount = bobPage.getByLabel('Amount to Pay');
    const errorDescriptionId = await settlementAmount.getAttribute('aria-describedby');
    expect(errorDescriptionId).toBe('settlement-amount-error');
    await expect(bobPage.locator(`#${errorDescriptionId}`)).toContainText('cannot exceed');
    await bobPage.getByLabel('Amount to Pay').fill('40.00');
    await bobPage.getByLabel('Transaction reference').fill('E2E-UPI-REF-001');
    await bobPage.getByRole('button', { name: 'Payment Options' }).click();
    await expect(bobPage.locator('canvas[aria-label^="UPI QR code"]')).toBeVisible();
    await screenshot(bobPage, '06-real-upi-qr-mobile.png');
    let settlementCreateRequests = 0;
    bobPage.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/v1/groups/${groupId}/settlements`) {
        settlementCreateRequests += 1;
      }
    });
    await simulateUpiAppReturn(bobPage);
    expect(settlementCreateRequests).toBe(0);
    await bobPage.getByRole('button', { name: 'Not yet' }).click();
    expect(settlementCreateRequests).toBe(0);
    await simulateUpiAppReturn(bobPage);
    await bobPage.getByRole('button', { name: 'Yes, payment completed' }).click();
    expect(settlementCreateRequests).toBe(0);
    await bobPage.getByRole('button', { name: 'Review Claim' }).click();
    expect(settlementCreateRequests).toBe(0);
    await bobPage.getByRole('button', { name: 'Submit Claim' }).click();
    await expect(bobPage.getByRole('heading', { name: 'Payment claim submitted' })).toBeVisible();
    expect(settlementCreateRequests).toBe(1);
    const firstClaimHref = await bobPage.getByRole('link', { name: 'View Claim' }).getAttribute('href');
    expect(firstClaimHref).toMatch(new RegExp(`^/groups/${groupId}/settlements/[0-9a-f-]{36}$`));
    await bobPage.goto(firstClaimHref!);
    await bobPage.waitForURL(new RegExp(`/groups/${groupId}/settlements/[0-9a-f-]{36}$`));
    const settlementUrl = bobPage.url();
    await expect(bobPage.getByText('Waiting for confirmation')).toBeVisible();
    await expectNoSeriousAxeViolations(bobPage);
    await screenshot(bobPage, '07-payer-waiting-mobile.png');

    await expect(alicePage.locator(`a[href="${new URL(settlementUrl).pathname}"]`).first()).toBeVisible({ timeout: 25_000 });
    await screenshot(alicePage, '08-receiver-inbox.png');
    await alicePage.locator(`a[href="${new URL(settlementUrl).pathname}"]`).first().click();
    await expect(alicePage.getByRole('button', { name: 'Confirm' })).toBeVisible();
    await alicePage.route(/\/confirm$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    }, { times: 1 });
    await alicePage.getByRole('button', { name: 'Confirm' }).click();
    await expect(alicePage.getByRole('dialog')).toBeVisible();
    await alicePage.getByRole('button', { name: 'Confirm Received' }).click();
    await expect(alicePage.getByRole('dialog')).toBeFocused();
    await expect(alicePage.getByText('Payment confirmed. Group balances now reflect this settlement.')).toBeVisible();
    await screenshot(alicePage, '09-settlement-confirmed-desktop.png');

    await bobPage.goto(settlementUrl);
    await expect(bobPage.getByRole('status').getByText('Confirmed', { exact: true })).toBeVisible();
    await bobPage.goto(groupUrl);
    await bobPage.getByRole('button', { name: 'Balances' }).click();
    const remainingAfterPartial = await groupBalance(bobPage, groupId);
    expect(remainingAfterPartial).toMatchObject({ balance: '-46.67', direction: 'you_owe' });

    await bobPage.getByRole('link', { name: /Settle Up/ }).click();
    await bobPage.getByLabel('Amount to Pay').fill('10.00');
    await bobPage.getByLabel('Transaction reference').fill('E2E-REJECT-001');
    await bobPage.getByRole('button', { name: 'Payment Options' }).click();
    await bobPage.getByRole('button', { name: 'I paid using the QR' }).click();
    expect(settlementCreateRequests).toBe(1);
    await bobPage.getByRole('button', { name: 'Yes, payment completed' }).click();
    await bobPage.getByRole('button', { name: 'Review Claim' }).click();
    expect(settlementCreateRequests).toBe(1);
    await bobPage.getByRole('button', { name: 'Submit Claim' }).click();
    await expect(bobPage.getByRole('heading', { name: 'Payment claim submitted' })).toBeVisible();
    expect(settlementCreateRequests).toBe(2);
    const rejectedClaimHref = await bobPage.getByRole('link', { name: 'View Claim' }).getAttribute('href');
    expect(rejectedClaimHref).toMatch(new RegExp(`^/groups/${groupId}/settlements/[0-9a-f-]{36}$`));
    await bobPage.goto(rejectedClaimHref!);
    await bobPage.waitForURL(new RegExp(`/groups/${groupId}/settlements/[0-9a-f-]{36}$`));
    const rejectedSettlementUrl = bobPage.url();
    await alicePage.goto(rejectedSettlementUrl);
    await alicePage.getByRole('button', { name: 'Reject' }).click();
    await alicePage.getByRole('dialog').getByRole('button', { name: 'Reject Claim' }).click();
    await expect(alicePage.getByText('Payment claim rejected. No balances were changed.')).toBeVisible();
    await expectNoSeriousAxeViolations(alicePage);
    expect(await groupBalance(bobPage, groupId)).toEqual(remainingAfterPartial);
    await bobPage.goto('/notifications');
    await expect(bobPage.locator(`a[href="${new URL(rejectedSettlementUrl).pathname}"]`).first()).toBeVisible();
    await bobPage.locator(`a[href="${new URL(rejectedSettlementUrl).pathname}"]`).first().click();
    await expect(bobPage.getByRole('status').getByText('Rejected', { exact: true })).toBeVisible();

    const aliceNotifications = await browserData<Array<{ href: string }>>(alicePage, '/api/v1/notifications?limit=100');
    expect(aliceNotifications.every(({ href }) => new RegExp(`^/groups/${groupId}(?:$|/settlements/[0-9a-f-]{36}$)`).test(href))).toBe(true);

    const deepLinkContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const deepLinkPage = await deepLinkContext.newPage();
    try {
      await deepLinkPage.goto(settlementUrl);
      await deepLinkPage.waitForURL(/\/login\?next=/);
      expect(new URL(deepLinkPage.url()).searchParams.get('next')).toBe(new URL(settlementUrl).pathname);
      await submitLogin(deepLinkPage, alice.email);
      await deepLinkPage.waitForURL(new URL(settlementUrl).pathname);
      await expect(deepLinkPage.getByRole('status').getByText('Confirmed', { exact: true })).toBeVisible();
    } finally {
      await deepLinkContext.close();
    }

    await alicePage.goto(groupUrl);
    await alicePage.getByRole('button', { name: 'Balances' }).click();
    await expect(alicePage.getByText(/You are owed/)).toBeVisible();
    await expectNoSeriousAxeViolations(alicePage);
    await alicePage.getByRole('button', { name: 'Settlements' }).click();
    await expect(alicePage.getByText('Your settlement history')).toBeVisible();
    await expect(alicePage.getByText('Confirmed', { exact: true })).toBeVisible();

    await alicePage.goto(`${groupUrl}/settings`);
    await alicePage.getByLabel('Simplify group debts').uncheck();
    await alicePage.getByRole('button', { name: 'Save Changes' }).click();
    await expect(alicePage.getByRole('status')).toContainText('Saved');
    await alicePage.waitForTimeout(1_700);

    await alicePage.goto('/notifications');
    await expect(alicePage.getByRole('heading', { name: 'Browser notifications' })).toBeVisible();
    const swRegistered = await alicePage.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration('/')));
    expect(swRegistered).toBe(true);

    await alicePage.addInitScript((endpoint) => {
      const createSubscription = (): PushSubscription => ({
        endpoint,
        expirationTime: null,
        options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer, userVisibleOnly: true },
        getKey: () => null,
        toJSON: () => ({
          endpoint,
          expirationTime: null,
          keys: { p256dh: 'A'.repeat(88), auth: 'B'.repeat(24) },
        }),
        unsubscribe: async () => {
          localStorage.removeItem('expenso.e2e.push-active');
          const count = Number(localStorage.getItem('expenso.e2e.push-unsubscribed') ?? '0') + 1;
          localStorage.setItem('expenso.e2e.push-unsubscribed', String(count));
          activeSubscription = null;
          return true;
        },
      } as PushSubscription);
      let activeSubscription: PushSubscription | null = localStorage.getItem('expenso.e2e.push-active') === 'yes'
        ? createSubscription()
        : null;
      const pushManager = {
        getSubscription: async () => activeSubscription,
        subscribe: async (options: PushSubscriptionOptionsInit) => {
          const source = options.applicationServerKey;
          if (!source) throw new Error('Missing application server key.');
          if (typeof source === 'string') throw new Error('Unexpected string application server key.');
          const sourceBytes = source instanceof ArrayBuffer
            ? new Uint8Array(source)
            : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
          const applicationServerKey = sourceBytes.slice().buffer;
          activeSubscription = createSubscription();
          Object.defineProperty(activeSubscription.options, 'applicationServerKey', { value: applicationServerKey });
          localStorage.setItem('expenso.e2e.push-active', 'yes');
          return activeSubscription;
        },
      };
      const registration = { pushManager } as unknown as ServiceWorkerRegistration;
      Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
      const permission = localStorage.getItem('expenso.e2e.push-permission') === 'denied' ? 'denied' : 'granted';
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: { permission, requestPermission: async () => permission },
      });
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          addEventListener: () => undefined,
          getRegistration: async () => registration,
          ready: Promise.resolve(registration),
          register: async () => registration,
          removeEventListener: () => undefined,
        },
      });
    }, `https://fcm.googleapis.com/fcm/send/${runId}`);
    await alicePage.reload();
    await alicePage.getByRole('button', { name: 'Turn on' }).click();
    await expect(alicePage.getByText('On', { exact: true })).toBeVisible();
    await expect(alicePage.getByRole('button', { name: 'Turn off' })).toBeVisible();
    await alicePage.getByRole('button', { name: 'Turn off' }).click();
    await expect(alicePage.getByRole('button', { name: 'Turn on' })).toBeVisible();
    await alicePage.evaluate(() => localStorage.setItem('expenso.e2e.push-permission', 'denied'));
    await alicePage.reload();
    await expect(alicePage.getByText(/Notifications are blocked/)).toBeVisible();
    await alicePage.evaluate(() => localStorage.setItem('expenso.e2e.push-permission', 'granted'));
    await alicePage.reload();
    await alicePage.getByRole('button', { name: 'Turn on' }).click();
    await expect(alicePage.getByText('On', { exact: true })).toBeVisible();

    await alicePage.setViewportSize({ width: 820, height: 1180 });
    await alicePage.goto('/dashboard');
    await screenshot(alicePage, '10-dashboard-tablet.png');
    await alicePage.setViewportSize({ width: 1440, height: 900 });

    await bobPage.goto('/profile');
    await bobPage.getByRole('button', { name: 'Sign Out' }).click();
    await bobPage.waitForURL(/\/login(?:\?|$)/);
    await bobPage.goto('/dashboard');
    await bobPage.waitForURL(/\/login\?next=/);
    await screenshot(bobPage, '11-signout-protected-redirect-mobile.png');
    await submitLogin(bobPage, alice.email);
    await bobPage.waitForURL(/\/dashboard$/);
    await expect(bobPage.getByRole('heading', { name: /Alice/ })).toBeVisible();
    await expect(bobPage.getByText('Bob Splitter', { exact: true })).toBeHidden();

    await aliceContext.clearCookies();
    await alicePage.goto('/login');
    await submitLogin(alicePage, bob.email);
    await alicePage.waitForURL(/\/dashboard$/);
    await expect(alicePage.getByRole('heading', { name: /Bob/ })).toBeVisible();
    await expect(alicePage.getByText('Alice Ledger Updated', { exact: true })).toBeHidden();
    expect(await alicePage.evaluate(() => ({
      stored: localStorage.getItem('expenso.push-subscription.v1'),
      active: localStorage.getItem('expenso.e2e.push-active'),
      unsubscribeCount: Number(localStorage.getItem('expenso.e2e.push-unsubscribed') ?? '0'),
    }))).toMatchObject({ stored: null, active: null, unsubscribeCount: 2 });
    expect(browserSecurityErrors).toEqual([]);
  } finally {
    await closeWithEvidence(aliceContext);
    await closeWithEvidence(bobContext);
  }
});
