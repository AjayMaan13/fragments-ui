# fragments-ui
a simple web app to manage authentication with our User Pool on AWS Cognito and test our back-end fragments microservice


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
