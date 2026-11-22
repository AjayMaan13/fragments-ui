// e2e/helpers.js

// Shared pieces for the Tier 1 tests: a fake logged-in session, and a fake API.

import { test as base, expect } from '@playwright/test';

// Must match the values the UI is built with (see "build:e2e" in package.json)
export const POOL_ID = 'us-east-2_TESTPOOL';
export const CLIENT_ID = 'testclientid';
export const AUTHORITY = `https://cognito-idp.us-east-2.amazonaws.com/${POOL_ID}`;

// oidc-client-ts keeps the logged-in user in sessionStorage under this key
// (confirmed against node_modules/oidc-client-ts: "oidc." + "user:" + authority + ":" + client_id)
export const USER_STORAGE_KEY = `oidc.user:${AUTHORITY}:${CLIENT_ID}`;

const fakeUser = () => ({
  id_token: 'fake-id-token',
  access_token: 'fake-access-token',
  token_type: 'Bearer',
  scope: 'phone openid email',
  // far in the future, so the library never treats the session as expired
  expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  profile: {
    sub: 'user-1',
    'cognito:username': 'testuser',
    email: 'test@example.com',
  },
});

// Log in without the Cognito hosted page: put the session where the app looks for it
export async function signIn(page) {
  await page.addInitScript(
    ({ key, value }) => window.sessionStorage.setItem(key, value),
    { key: USER_STORAGE_KEY, value: JSON.stringify(fakeUser()) }
  );
}

// Every test blocks the icon font (a CDN link in index.html): tests must not depend on the internet
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://cdn.jsdelivr.net/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' })
    );
    await use(page);
  },
});
export { expect };

let counter = 0;
const newId = () => `${String(++counter).padStart(8, '0')}-1111-4222-8333-444455556666`;

/**
 * A fake of the fragments API, served from inside the browser. It keeps fragments
 * in memory, answers like the real API, records every request, and can be told to
 * fail a given operation to test the UI's error handling.
 *
 *   const api = await mockApi(page, { fragments: [...], fail: { create: 500 } });
 *   api.requests  // [{ method, path, search, headers, body }]
 *   api.fragments // current state
 *
 * Operations that can fail: list, create, data, update, delete, convert, share.
 */
export async function mockApi(page, { fragments = [], fail = {} } = {}) {
  const api = { fragments: [...fragments], requests: [], fail: { ...fail } };

  const json = (route, status, body, headers = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
  const error = (route, status) =>
    json(route, status, { status: 'error', error: { code: status, message: 'forced failure' } });

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    api.requests.push({
      method,
      path: url.pathname,
      search: url.search,
      headers: request.headers(),
      body: request.postData(),
    });

    const [, , , id, sub] = url.pathname.split('/'); // ['', 'v1', 'fragments', id, sub]
    const dot = id ? id.indexOf('.') : -1;
    const fragmentId = dot === -1 ? id : id.slice(0, dot);
    const ext = dot === -1 ? '' : id.slice(dot);
    const found = api.fragments.find((f) => f.id === fragmentId);

    // GET /v1/fragments?expand=1
    if (!id && method === 'GET') {
      if (api.fail.list) return error(route, api.fail.list);
      return json(route, 200, { status: 'ok', fragments: api.fragments });
    }
    // POST /v1/fragments
    if (!id && method === 'POST') {
      if (api.fail.create) return error(route, api.fail.create);
      const expiresIn = Number(url.searchParams.get('expiresIn'));
      const fragment = {
        id: newId(),
        ownerId: 'owner',
        type: request.headers()['content-type'],
        size: (request.postDataBuffer() || Buffer.alloc(0)).length,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        viewCount: 0,
        ...(expiresIn ? { expiresAt: Math.floor(Date.now() / 1000) + expiresIn } : {}),
      };
      api.fragments.push(fragment);
      api.bodies = { ...api.bodies, [fragment.id]: request.postData() };
      return json(route, 201, { status: 'ok', fragment }, { Location: `http://localhost/v1/fragments/${fragment.id}` });
    }

    if (!found) return error(route, 404);

    if (sub === 'share' && method === 'GET') {
      if (api.fail.share) return error(route, api.fail.share);
      return json(route, 200, {
        status: 'ok',
        url: `https://share.example/${found.id}?sig=abc`,
        expiresIn: 900,
        expiresAt: Math.floor(Date.now() / 1000) + 900,
      });
    }
    // GET /v1/fragments/:id.ext  (a conversion)
    if (ext && method === 'GET') {
      if (api.fail.convert) return error(route, api.fail.convert);
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: `converted to ${ext}` });
    }
    // GET /v1/fragments/:id  (raw data)
    if (method === 'GET') {
      if (api.fail.data) return error(route, api.fail.data);
      return route.fulfill({ status: 200, contentType: found.type, body: (api.bodies || {})[found.id] ?? 'stored content' });
    }
    // PUT /v1/fragments/:id
    if (method === 'PUT') {
      if (api.fail.update) return error(route, api.fail.update);
      api.bodies = { ...api.bodies, [found.id]: request.postData() };
      found.size = (request.postDataBuffer() || Buffer.alloc(0)).length;
      return json(route, 200, { status: 'ok', fragment: found });
    }
    // DELETE /v1/fragments/:id
    if (method === 'DELETE') {
      if (api.fail.delete) return error(route, api.fail.delete);
      api.fragments = api.fragments.filter((f) => f.id !== found.id);
      return json(route, 200, { status: 'ok' });
    }
    return error(route, 405);
  });

  return api;
}

// A fragment record as the API returns it, for seeding mockApi
export const fragment = (overrides = {}) => ({
  id: newId(),
  ownerId: 'owner',
  type: 'text/plain',
  size: 12,
  created: '2026-01-15T10:00:00.000Z',
  updated: '2026-01-15T10:00:00.000Z',
  viewCount: 0,
  ...overrides,
});
