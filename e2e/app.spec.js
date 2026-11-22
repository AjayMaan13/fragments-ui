// e2e/app.spec.js

// Tier 1: the built UI in a real browser against a fake API (see helpers.js).
// No AWS, no backend. Covers what a user can do (list, create, update, delete,
// convert and download, share) and how the UI behaves when the API fails.

import { test, expect, signIn, mockApi, fragment, USER_STORAGE_KEY } from './helpers.js';

const toast = (page) => page.locator('#toast');
const cards = (page) => page.locator('.fragment-card');
const cardFor = (page, f) => page.locator('.fragment-card', { hasText: f.id.slice(0, 8) });
const posts = (api) => api.requests.filter((r) => r.method === 'POST');
const short = (f) => f.id.slice(0, 8);

test.describe('signed out', () => {
  test('shows Login and hides everything else', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login')).toBeVisible();
    await expect(page.locator('#logout')).toBeHidden();
    await expect(page.locator('#user')).toBeHidden();
    await expect(page.locator('#username-badge')).toBeHidden();
  });

  test('Login sends the browser to Cognito with a PKCE authorization-code request', async ({ page }) => {
    // The library first reads the provider's metadata, then redirects to its authorize endpoint
    await page.route('**/.well-known/openid-configuration', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          issuer: 'https://auth.test',
          authorization_endpoint: 'https://auth.test/oauth2/authorize',
          token_endpoint: 'https://auth.test/oauth2/token',
        }),
      })
    );
    await page.route('https://auth.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>hosted login</h1>' })
    );

    await page.goto('/');
    await page.locator('#login').click();
    await page.waitForURL(/auth\.test\/oauth2\/authorize/);

    const url = new URL(page.url());
    expect(url.searchParams.get('client_id')).toBe('testclientid');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4173');
    expect(url.searchParams.get('scope')).toContain('openid');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  });
});

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test('shows the username, Logout, and the form; hides Login', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.locator('#user')).toBeVisible();
    await expect(page.locator('#username-badge .username')).toHaveText('testuser');
    await expect(page.locator('#logout')).toBeVisible();
    await expect(page.locator('#login')).toBeHidden();
  });

  test('loads the list with the user token and expand=1', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/');
    await expect(page.locator('.empty-state')).toBeVisible();

    const list = api.requests.find((r) => r.method === 'GET' && r.path === '/v1/fragments');
    expect(list.search).toBe('?expand=1');
    expect(list.headers.authorization).toBe('Bearer fake-id-token');
  });

  test('Logout hides the app, shows Login, and forgets the session', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.locator('#user')).toBeVisible();

    await page.locator('#logout').click();
    await expect(page.locator('#user')).toBeHidden();
    await expect(page.locator('#login')).toBeVisible();
    await expect(page.locator('#logout')).toBeHidden();
    expect(await page.evaluate((k) => sessionStorage.getItem(k), USER_STORAGE_KEY)).toBeNull();
  });

  test.describe('the list', () => {
    test('empty state when there are no fragments', async ({ page }) => {
      await mockApi(page);
      await page.goto('/');
      await expect(page.locator('.empty-state strong')).toHaveText('No fragments yet');
      await expect(page.locator('#fragment-count')).toHaveText('');
    });

    test('shows the count and lists newest first', async ({ page }) => {
      const oldest = fragment({ created: '2026-01-01T00:00:00.000Z' });
      const newest = fragment({ created: '2026-03-01T00:00:00.000Z' });
      const middle = fragment({ created: '2026-02-01T00:00:00.000Z' });
      await mockApi(page, { fragments: [oldest, newest, middle] });
      await page.goto('/');

      await expect(page.locator('#fragment-count')).toHaveText('(3)');
      await expect(page.locator('.fragment-id')).toHaveText([short(newest), short(middle), short(oldest)]);
    });

    test('each card shows its type label and a colour class by kind', async ({ page }) => {
      const text = fragment({ type: 'text/plain; charset=utf-8' });
      const json = fragment({ type: 'application/json' });
      const csv = fragment({ type: 'text/csv' });
      const image = fragment({ type: 'image/png' });
      await mockApi(page, { fragments: [text, json, csv, image] });
      await page.goto('/');

      await expect(cardFor(page, text).locator('.badge')).toHaveText('Plain text');
      await expect(cardFor(page, text).locator('.badge')).toHaveClass(/badge-text/);
      await expect(cardFor(page, json).locator('.badge')).toHaveText('JSON');
      await expect(cardFor(page, json).locator('.badge')).toHaveClass(/badge-data/);
      await expect(cardFor(page, csv).locator('.badge')).toHaveClass(/badge-csv/);
      await expect(cardFor(page, image).locator('.badge')).toHaveText('PNG');
      await expect(cardFor(page, image).locator('.badge')).toHaveClass(/badge-image/);
    });

    test('sizes are shown in B, KB or MB', async ({ page }) => {
      const small = fragment({ size: 500 });
      const medium = fragment({ size: 1536 });
      const large = fragment({ size: 2 * 1024 * 1024 });
      await mockApi(page, { fragments: [small, medium, large] });
      await page.goto('/');

      await expect(cardFor(page, small).locator('.fragment-size')).toHaveText('500 B');
      await expect(cardFor(page, medium).locator('.fragment-size')).toHaveText('1.5 KB');
      await expect(cardFor(page, large).locator('.fragment-size')).toHaveText('2.0 MB');
    });

    test('view counts are singular for one and plural otherwise; expiry appears only when set', async ({ page }) => {
      const none = fragment({ viewCount: 0 });
      const one = fragment({ viewCount: 1 });
      const many = fragment({ viewCount: 5, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
      await mockApi(page, { fragments: [none, one, many] });
      await page.goto('/');

      await expect(cardFor(page, none).locator('.chip[title="Times its data was read"]')).toContainText('0 views');
      await expect(cardFor(page, one).locator('.chip[title="Times its data was read"]')).toContainText('1 view');
      await expect(cardFor(page, one).locator('.chip[title="Times its data was read"]')).not.toContainText('views');
      await expect(cardFor(page, many).locator('.chip[title="Times its data was read"]')).toContainText('5 views');

      await expect(cardFor(page, none).locator('.chip-expiry')).toHaveCount(0);
      await expect(cardFor(page, many).locator('.chip-expiry')).toContainText('Expires');
    });
  });

  test.describe('creating', () => {
    test('a text fragment: sends type, body and token; clears the form; shows the new card', async ({ page }) => {
      const api = await mockApi(page);
      await page.goto('/');

      await page.locator('#fragment-type').selectOption('text/markdown');
      await page.locator('#fragment-text').fill('# Hello');
      await page.getByRole('button', { name: 'Create fragment' }).click();

      await expect(toast(page)).toHaveText('Fragment created');
      await expect(toast(page)).not.toHaveClass(/error/);
      await expect(page.locator('#fragment-text')).toHaveValue('');
      await expect(cards(page)).toHaveCount(1);
      await expect(page.locator('#fragment-count')).toHaveText('(1)');
      await expect(cards(page).first().locator('.badge')).toHaveText('Markdown');

      const [post] = posts(api);
      expect(post.path).toBe('/v1/fragments');
      expect(post.search).toBe('');
      expect(post.headers['content-type']).toBe('text/markdown');
      expect(post.headers.authorization).toBe('Bearer fake-id-token');
      expect(post.body).toBe('# Hello');
    });

    test('content is trimmed, and empty or whitespace-only content is refused without calling the API', async ({ page }) => {
      const api = await mockApi(page);
      await page.goto('/');

      await page.getByRole('button', { name: 'Create fragment' }).click();
      await expect(toast(page)).toHaveText('Enter some content first');
      await expect(toast(page)).toHaveClass(/error/);

      await page.locator('#fragment-text').fill('   \n  ');
      await page.getByRole('button', { name: 'Create fragment' }).click();
      await expect(toast(page)).toHaveText('Enter some content first');
      expect(posts(api)).toHaveLength(0);

      await page.locator('#fragment-text').fill('  padded  ');
      await page.getByRole('button', { name: 'Create fragment' }).click();
      await expect(toast(page)).toHaveText('Fragment created');
      expect(posts(api)[0].body).toBe('padded');
    });

    test('an expiry choice becomes ?expiresIn= and then resets', async ({ page }) => {
      const api = await mockApi(page);
      await page.goto('/');

      await page.locator('#fragment-expires').selectOption('3600');
      await page.locator('#fragment-text').fill('temporary');
      await page.getByRole('button', { name: 'Create fragment' }).click();

      await expect(toast(page)).toHaveText('Fragment created');
      expect(posts(api)[0].search).toBe('?expiresIn=3600');
      await expect(page.locator('#fragment-expires')).toHaveValue('');
      await expect(cards(page).first().locator('.chip-expiry')).toContainText('Expires');
    });

    test('an attached image replaces the text fields, can be removed, and uploads with its own type', async ({ page }) => {
      const api = await mockApi(page);
      await page.goto('/');
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

      await page.locator('#fragment-file').setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: png });
      await expect(page.locator('#file-name')).toHaveText('pic.png');
      await expect(page.locator('#fragment-text')).toBeDisabled();
      await expect(page.locator('#fragment-type')).toBeDisabled();

      // removing it gives the text fields back
      await page.locator('#file-clear').click();
      await expect(page.locator('#file-name')).toBeHidden();
      await expect(page.locator('#fragment-text')).toBeEnabled();
      await expect(page.locator('#fragment-type')).toBeEnabled();

      await page.locator('#fragment-file').setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: png });
      await page.getByRole('button', { name: 'Create fragment' }).click();

      await expect(toast(page)).toHaveText('Fragment created');
      expect(posts(api)[0].headers['content-type']).toBe('image/png');
      expect(api.fragments[0].size).toBe(png.length);
      await expect(cards(page).first().locator('.badge')).toHaveText('PNG');
      await expect(page.locator('#file-name')).toBeHidden();
    });

    test('a failed create says so, keeps what was typed, and adds nothing', async ({ page }) => {
      await mockApi(page, { fail: { create: 500 } });
      await page.goto('/');

      await page.locator('#fragment-text').fill('keep me');
      await page.getByRole('button', { name: 'Create fragment' }).click();

      await expect(toast(page)).toHaveText('Could not create the fragment');
      await expect(toast(page)).toHaveClass(/error/);
      await expect(page.locator('#fragment-text')).toHaveValue('keep me');
      await expect(cards(page)).toHaveCount(0);
    });

    test('the toast goes away by itself', async ({ page }) => {
      await mockApi(page);
      await page.goto('/');
      await page.getByRole('button', { name: 'Create fragment' }).click();
      await expect(toast(page)).toBeVisible();
      await expect(toast(page)).toBeHidden({ timeout: 6000 });
    });
  });

  test.describe('updating', () => {
    test('Update opens an editor pre-filled with the current content, and Save sends it with the same type', async ({ page }) => {
      const f = fragment({ type: 'text/markdown' });
      const api = await mockApi(page, { fragments: [f] });
      api.bodies = { [f.id]: '# old' };
      await page.goto('/');

      await cardFor(page, f).getByRole('button', { name: 'Update' }).click();
      const editor = cardFor(page, f).locator('.card-actions.editing textarea');
      await expect(editor).toHaveValue('# old');

      await editor.fill('# new');
      await cardFor(page, f).getByRole('button', { name: 'Save' }).click();

      await expect(toast(page)).toHaveText('Fragment updated');
      const put = api.requests.find((r) => r.method === 'PUT');
      expect(put.path).toBe(`/v1/fragments/${f.id}`);
      expect(put.headers['content-type']).toBe('text/markdown');
      expect(put.body).toBe('# new');
      // back to the normal buttons
      await expect(cardFor(page, f).getByRole('button', { name: 'Update' })).toBeVisible();
    });

    test('Cancel closes the editor without saving', async ({ page }) => {
      const f = fragment();
      const api = await mockApi(page, { fragments: [f] });
      await page.goto('/');

      await cardFor(page, f).getByRole('button', { name: 'Update' }).click();
      await cardFor(page, f).getByRole('button', { name: 'Cancel' }).click();

      await expect(cardFor(page, f).getByRole('button', { name: 'Update' })).toBeVisible();
      expect(api.requests.some((r) => r.method === 'PUT')).toBe(false);
    });

    test('if the current content cannot be loaded the editor opens empty', async ({ page }) => {
      const f = fragment();
      await mockApi(page, { fragments: [f], fail: { data: 500 } });
      await page.goto('/');

      await cardFor(page, f).getByRole('button', { name: 'Update' }).click();
      await expect(cardFor(page, f).locator('.card-actions.editing textarea')).toHaveValue('');
    });

    test('a failed update says so', async ({ page }) => {
      const f = fragment();
      await mockApi(page, { fragments: [f], fail: { update: 500 } });
      await page.goto('/');

      await cardFor(page, f).getByRole('button', { name: 'Update' }).click();
      await cardFor(page, f).getByRole('button', { name: 'Save' }).click();
      await expect(toast(page)).toHaveText('Could not update the fragment');
      await expect(toast(page)).toHaveClass(/error/);
    });

    test('an image fragment is updated by choosing a file, and Save does nothing without one', async ({ page }) => {
      const f = fragment({ type: 'image/png' });
      const api = await mockApi(page, { fragments: [f] });
      await page.goto('/');

      await cardFor(page, f).getByRole('button', { name: 'Update' }).click();
      await expect(cardFor(page, f).locator('.card-actions.editing textarea')).toHaveCount(0);

      await cardFor(page, f).getByRole('button', { name: 'Save' }).click();
      expect(api.requests.some((r) => r.method === 'PUT')).toBe(false);

      await cardFor(page, f).locator('.card-actions.editing input[type="file"]').setInputFiles({
        name: 'new.png',
        mimeType: 'image/png',
        buffer: Buffer.from('89504e47', 'hex'),
      });
      await cardFor(page, f).getByRole('button', { name: 'Save' }).click();
      await expect(toast(page)).toHaveText('Fragment updated');
      expect(api.requests.find((r) => r.method === 'PUT').headers['content-type']).toBe('image/png');
    });
  });

  test.describe('deleting', () => {
    test('confirming deletes the fragment and shows the empty state', async ({ page }) => {
      const f = fragment();
      const api = await mockApi(page, { fragments: [f] });
      await page.goto('/');

      page.once('dialog', (dialog) => {
        expect(dialog.message()).toBe(`Delete fragment ${short(f)}?`);
        dialog.accept();
      });
      await cardFor(page, f).getByRole('button', { name: 'Delete' }).click();

      await expect(toast(page)).toHaveText('Fragment deleted');
      await expect(cards(page)).toHaveCount(0);
      await expect(page.locator('.empty-state')).toBeVisible();
      expect(api.requests.find((r) => r.method === 'DELETE').path).toBe(`/v1/fragments/${f.id}`);
    });

    test('cancelling the confirmation deletes nothing', async ({ page }) => {
      const f = fragment();
      const api = await mockApi(page, { fragments: [f] });
      await page.goto('/');

      page.once('dialog', (dialog) => dialog.dismiss());
      await cardFor(page, f).getByRole('button', { name: 'Delete' }).click();

      await expect(cards(page)).toHaveCount(1);
      expect(api.requests.some((r) => r.method === 'DELETE')).toBe(false);
    });

    test('a failed delete says so and the fragment stays', async ({ page }) => {
      const f = fragment();
      await mockApi(page, { fragments: [f], fail: { delete: 500 } });
      await page.goto('/');

      page.once('dialog', (dialog) => dialog.accept());
      await cardFor(page, f).getByRole('button', { name: 'Delete' }).click();

      await expect(toast(page)).toHaveText('Could not delete the fragment');
      await expect(toast(page)).toHaveClass(/error/);
      await expect(cards(page)).toHaveCount(1);
    });
  });

  test.describe('converting and downloading', () => {
    test('offers exactly the formats the type can convert to', async ({ page }) => {
      const markdown = fragment({ type: 'text/markdown' });
      const html = fragment({ type: 'text/html' });
      const image = fragment({ type: 'image/png' });
      await mockApi(page, { fragments: [markdown, html, image] });
      await page.goto('/');

      const options = (f) => cardFor(page, f).locator('select[aria-label="Download as"] option').allTextContents();
      expect(await options(markdown)).toEqual(['Download as...', 'HTML', 'Plain text', 'PDF document', 'Word document']);
      expect(await options(html)).toEqual(['Download as...', 'Plain text']);
      // an image can become any other image format, but not itself
      expect(await options(image)).toEqual(['Download as...', 'JPEG image', 'WebP image', 'AVIF image', 'GIF image']);
    });

    test('only images get a width box', async ({ page }) => {
      const text = fragment({ type: 'text/plain' });
      const image = fragment({ type: 'image/jpeg' });
      await mockApi(page, { fragments: [text, image] });
      await page.goto('/');

      await expect(cardFor(page, text).locator('input[type="number"]')).toHaveCount(0);
      await expect(cardFor(page, image).locator('input[type="number"]')).toHaveCount(1);
    });

    test('choosing a format downloads the converted file named after the fragment', async ({ page }) => {
      const f = fragment({ type: 'text/markdown' });
      const api = await mockApi(page, { fragments: [f] });
      await page.goto('/');

      const download = page.waitForEvent('download');
      await cardFor(page, f).locator('select[aria-label="Download as"]').selectOption('.pdf');
      const file = await download;

      expect(file.suggestedFilename()).toBe(`${short(f)}.pdf`);
      const request = api.requests.find((r) => r.path === `/v1/fragments/${f.id}.pdf`);
      expect(request.search).toBe('');
      expect(request.headers.authorization).toBe('Bearer fake-id-token');
      // the menu goes back to its placeholder, ready for another choice
      await expect(cardFor(page, f).locator('select[aria-label="Download as"]')).toHaveValue('');
    });

    test('an image can be shrunk by typing a width first', async ({ page }) => {
      const f = fragment({ type: 'image/png' });
      const api = await mockApi(page, { fragments: [f] });
      await page.goto('/');

      await cardFor(page, f).locator('input[type="number"]').fill('200');
      const download = page.waitForEvent('download');
      await cardFor(page, f).locator('select[aria-label="Download as"]').selectOption('.webp');
      expect((await download).suggestedFilename()).toBe(`${short(f)}.webp`);

      const request = api.requests.find((r) => r.path === `/v1/fragments/${f.id}.webp`);
      expect(request.search).toBe('?width=200');
    });

    test('a failed conversion says which format and downloads nothing', async ({ page }) => {
      const f = fragment({ type: 'text/markdown' });
      await mockApi(page, { fragments: [f], fail: { convert: 500 } });
      await page.goto('/');

      let downloaded = false;
      page.on('download', () => (downloaded = true));
      await cardFor(page, f).locator('select[aria-label="Download as"]').selectOption('.pdf');

      await expect(toast(page)).toHaveText('Could not convert to PDF document');
      await expect(toast(page)).toHaveClass(/error/);
      expect(downloaded).toBe(false);
      // the select is usable again
      await expect(cardFor(page, f).locator('select[aria-label="Download as"]')).toBeEnabled();
    });
  });

  test.describe('sharing', () => {
    test('Share shows a link and how long it lasts; a second click hides it', async ({ page }) => {
      const f = fragment();
      const api = await mockApi(page, { fragments: [f] });
      await page.goto('/');

      await cardFor(page, f).getByRole('button', { name: 'Share' }).click();
      const box = cardFor(page, f).locator('.share-box');
      await expect(box.locator('input[aria-label="Share link"]')).toHaveValue(`https://share.example/${f.id}?sig=abc`);
      await expect(box.locator('.share-note')).toHaveText('Anyone with this link can view it for 15 min.');
      expect(api.requests.find((r) => r.path === `/v1/fragments/${f.id}/share`)).toBeTruthy();

      await cardFor(page, f).getByRole('button', { name: 'Share' }).click();
      await expect(box).toHaveCount(0);
    });

    test('Copy puts the link on the clipboard', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const f = fragment();
      await mockApi(page, { fragments: [f] });
      await page.goto('/');

      await cardFor(page, f).getByRole('button', { name: 'Share' }).click();
      await cardFor(page, f).locator('.share-box').getByRole('button', { name: 'Copy' }).click();

      await expect(toast(page)).toHaveText('Link copied');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://share.example/${f.id}?sig=abc`);
    });

    test('a failed share says so and shows no link', async ({ page }) => {
      const f = fragment();
      await mockApi(page, { fragments: [f], fail: { share: 500 } });
      await page.goto('/');

      await cardFor(page, f).getByRole('button', { name: 'Share' }).click();
      await expect(toast(page)).toHaveText('Could not create a share link');
      await expect(toast(page)).toHaveClass(/error/);
      await expect(cardFor(page, f).locator('.share-box')).toHaveCount(0);
    });
  });

  test.describe('when the API is down', () => {
    test('a failed list shows an error and no cards', async ({ page }) => {
      await mockApi(page, { fragments: [fragment()], fail: { list: 500 } });
      await page.goto('/');

      await expect(toast(page)).toHaveText('Could not load your fragments');
      await expect(toast(page)).toHaveClass(/error/);
      await expect(cards(page)).toHaveCount(0);
    });

    test('an expired token (401 on the list) is reported the same way', async ({ page }) => {
      await mockApi(page, { fail: { list: 401 } });
      await page.goto('/');
      await expect(toast(page)).toHaveText('Could not load your fragments');
    });
  });
});

test.describe('theme', () => {
  test('follows the system setting, can be toggled, and the choice is remembered', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

    // the saved choice wins over the system setting after a reload
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
