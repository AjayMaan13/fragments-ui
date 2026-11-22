// e2e/live.spec.js

// Tier 2: the real thing. A real browser, the real Cognito hosted login, the
// deployed API. It proves what the mocked Tier 1 tests cannot: login actually
// works and the deployed stack serves the UI's calls.
//
// Not part of `npm run test:e2e`. It needs a running stack and a test user, so
// it runs on purpose: `npm run test:e2e:live`, or the "live-e2e" GitHub workflow
// (manual). Credentials come from the environment, never from the repo:
//
//   E2E_USERNAME / E2E_PASSWORD   a Cognito test user in the deployed pool
//   E2E_BASE_URL                  where the UI is served (default http://localhost:1234,
//                                 which is what the Cognito app client allows)
//
// The UI itself must have been built with the real pool/client ids and the
// deployed API_URL (see .github/workflows/live-e2e.yml).

import { test, expect } from '@playwright/test';

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test.skip(!username || !password, 'set E2E_USERNAME and E2E_PASSWORD to run the live test');

test('log in with Cognito, create, convert, share and delete a fragment', async ({ page, request }) => {
  const content = `# live e2e ${new Date().toISOString()}`;

  // 1. Sign in through the real Cognito hosted login page
  await page.goto('/');
  await page.locator('#login').click();
  await page.waitForURL(/amazoncognito\.com/);
  // The hosted page renders its form twice (desktop and mobile layouts): use the visible one
  await page.locator('input[name="username"]:visible').fill(username);
  await page.locator('input[name="password"]:visible').fill(password);
  await page.locator('input[name="signInSubmitButton"]:visible').click();

  // Back in the app, logged in
  await page.waitForURL(/localhost/);
  await expect(page.locator('#user')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#logout')).toBeVisible();

  // 2. Create a markdown fragment
  await page.locator('#fragment-type').selectOption('text/markdown');
  await page.locator('#fragment-text').fill(content);
  await page.getByRole('button', { name: 'Create fragment' }).click();
  await expect(page.locator('#toast')).toHaveText('Fragment created');

  const card = page.locator('.fragment-card', { has: page.locator('.badge', { hasText: 'Markdown' }) }).first();
  await expect(card).toBeVisible();
  const id = (await card.locator('.fragment-id').getAttribute('title')) ?? '';
  expect(id).toMatch(/^[0-9a-f-]{36}$/);

  try {
    // 3. Convert it: the API turns the markdown into a real PDF
    const download = page.waitForEvent('download');
    await card.locator('select[aria-label="Download as"]').selectOption('.pdf');
    const file = await download;
    expect(file.suggestedFilename()).toBe(`${id.slice(0, 8)}.pdf`);
    const pdf = await file.createReadStream();
    const chunks = [];
    for await (const chunk of pdf) chunks.push(chunk);
    expect(Buffer.concat(chunks).subarray(0, 4).toString()).toBe('%PDF');

    // 4. Share it: the link is a pre-signed S3 URL anyone can open, no login
    await card.getByRole('button', { name: 'Share' }).click();
    const link = await card.locator('.share-box input[aria-label="Share link"]').inputValue();
    expect(link).toMatch(/^https:\/\//);
    const shared = await request.get(link);
    expect(shared.status()).toBe(200);
    expect(await shared.text()).toContain('live e2e');
  } finally {
    // 5. Delete it (also runs if a step above failed, so the test leaves nothing behind)
    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('#toast')).toHaveText('Fragment deleted');
    await expect(page.locator('.fragment-card', { hasText: id.slice(0, 8) })).toHaveCount(0);
  }
});
