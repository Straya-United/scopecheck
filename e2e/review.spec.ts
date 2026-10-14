import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('demo loads, evidence links, filters and reviewed state work', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page).toHaveTitle('ScopeCheck — Scope & quote review');
  await expect(page.getByRole('heading', { name: 'Riverside fit-out', exact: true })).toBeVisible();
  await expect(page.locator('.finding-row')).toHaveCount(5);
  await expect(page.locator('.summary-strip').getByRole('button', { name: '4 Covered' })).toBeVisible();
  await expect(page.locator('.inspector')).toContainText('40 m');
  await page.screenshot({ path: '/tmp/scopecheck-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Copy question', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('120 m');
  await page.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await expect(page.locator('.review-footer')).toContainText('1 of 5');
  await page.getByLabel('Filter findings').selectOption('reviewed');
  await expect(page.locator('.finding-row')).toHaveCount(1);
  await page.getByLabel('Filter findings').selectOption('covered');
  await expect(page.locator('.finding-row')).toHaveCount(4);
  await expect(page.locator('.inspector')).toContainText('Review note');
  await page.getByLabel('Filter findings').selectOption('all');
  await page.getByRole('button', { name: 'View scope line 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Scope', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#source-scope-1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('new text input recomputes findings, exports and clearly gates live AI', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.finding-row')).toHaveCount(5);
  await page.getByRole('button', { name: 'New review', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Workshop revision');
  await page.getByLabel('Scope of works', { exact: true }).fill('Supply and install 10 LED luminaires, including mounting brackets.');
  await page.getByLabel('Supplier quote', { exact: true }).fill('Supply and install 7 LED luminaires, including mounting brackets.');
  await page.getByRole('button', { name: 'Compare documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workshop revision', exact: true })).toBeVisible();
  await expect(page.locator('.finding-row')).toHaveCount(1);
  await expect(page.locator('.inspector')).toContainText('3 units');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export review', exact: true }).click();
  await page.getByRole('button', { name: /Download full review JSON/ }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('workshop-revision-review.json');
  const output = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(output.mode).toBe('rules'); expect(output.findings).toHaveLength(1); expect(output.documents.scope).toContain('10 LED');
  await page.getByRole('button', { name: 'Configure AI', exact: true }).click();
  await expect(page.getByText('Live AI is disabled', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send documents & run AI', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('text file import, validation and error recovery retain actual source evidence', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.finding-row')).toHaveCount(5);
  await page.getByRole('button', { name: 'New review', exact: true }).click();
  await page.getByRole('button', { name: 'Compare documents', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('at least 20 characters');
  await page.getByLabel('Import scope file', { exact: true }).setInputFiles({ name: 'scope.txt', mimeType: 'text/plain', buffer: Buffer.from('Supply and install 40 m of cable tray.') });
  await page.getByLabel('Import quote file', { exact: true }).setInputFiles({ name: 'quote.txt', mimeType: 'text/plain', buffer: Buffer.from('Supply and install 20 m of cable tray.') });
  await page.getByRole('button', { name: 'Compare documents', exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('20 m');
  await expect(page.locator('.evidence-quote').first()).toHaveText('Supply and install 40 m of cable tray.');
});

test('mobile has no horizontal overflow and core dialogs remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await expect(page.locator('.finding-row')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/scopecheck-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'New review', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Project name', { exact: true }).fill('Mobile review');
  await page.getByRole('button', { name: 'Use fictional demo', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.finding-row')).toHaveCount(5);
});
