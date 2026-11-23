# fragments-ui

[![ci](https://github.com/AjayMaan13/fragments-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/AjayMaan13/fragments-ui/actions/workflows/ci.yml)

A small browser app for the [fragments API](https://github.com/AjayMaan13/fragments): sign in with Amazon Cognito (OAuth authorization-code flow with PKCE, via `oidc-client-ts`) and create, view, update, delete, convert, download and share your fragments.

## What you can do

- **Sign in** with the Cognito hosted login; the app sends your ID token as a bearer token on every API call
- **Create** text, markdown, HTML, CSV, JSON, YAML or XML fragments, or attach an image, optionally with an expiry
- **See** your fragments newest first, with type, size, view count and expiry
- **Update** a fragment's content (its type can't change) and **delete** it, with a confirmation
- **Download as...**: convert a fragment to another format (PDF, Word, HTML, YAML, an image format, ...) and save it; images can be shrunk by width first
- **Share** a fragment with a temporary public link
- Light and dark themes, and clear messages when the API is down or rejects a request

The API also does semantic search and background conversions; the UI doesn't have screens for those yet.

## Run it

```bash
cp .env.example .env   # fill in the Cognito ids and API_URL
npm install
npm start              # http://localhost:1234
```



## Tests

End-to-end tests with [Playwright](https://playwright.dev), in two tiers.

### Tier 1: `npm run test:e2e` (runs in CI, needs nothing)

Builds the UI with dummy Cognito settings, serves it, and drives it in a real
Chromium. A fake login session is placed where `oidc-client-ts` keeps the user
(`sessionStorage`, key `oidc.user:<authority>:<client_id>`), and the fragments
API is replaced by an in-browser fake (`e2e/helpers.js`), so there is no AWS and
no backend. It covers listing, creating (text, image, expiry), updating,
deleting, converting and downloading, sharing, theme, the login redirect, and
how the UI reports each kind of API failure.

```bash
npm ci
npx playwright install chromium   # once
npm run test:e2e
```

### Tier 2: `npm run test:e2e:live` (manual)

One test that signs in through the **real** Cognito hosted login and creates,
converts, shares and deletes a fragment against the **deployed** API. It needs the
stack up and a Cognito test user, so it is not part of CI. Run it from the
"live-e2e" GitHub workflow (Actions tab, "Run workflow"); see the comments at the
top of `.github/workflows/live-e2e.yml` for the variables and secrets it reads.
Locally: build the UI with the real ids, serve it on `http://localhost:1234` (the
callback URL the Cognito app client allows), then
`E2E_USERNAME=... E2E_PASSWORD=... npm run test:e2e:live`.
