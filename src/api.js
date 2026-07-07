// src/api.js

// fragments microservice API to use, defaults to localhost:8080 if not set in env
const apiUrl = process.env.API_URL || 'http://localhost:8080';

/**
 * Given an authenticated user, request all fragments for this user from the
 * fragments microservice (currently only running locally). We expect a user
 * to have an `idToken` attached, so we can send that along with the request.
 */
export async function getUserFragments(user) {
  console.log('Requesting user fragments data...');
  try {
    const fragmentsUrl = new URL('/v1/fragments?expand=1', apiUrl);
    const res = await fetch(fragmentsUrl, {
      // Generate headers with the proper Authorization bearer token to pass.
      // We are using the `authorizationHeaders()` helper method we defined
      // earlier, to automatically attach the user's ID token.
      headers: user.authorizationHeaders(),
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    console.log('Successfully got user fragments data', { data });
    return data;
  } catch (err) {
    console.error('Unable to call GET /v1/fragments', { err });
  }
}

// POST a new fragment of the given type for the authenticated user
export async function postUserFragment(user, text, type = 'text/plain') {
  console.log('Posting new fragment...', { type });
  try {
    const res = await fetch(new URL('/v1/fragments', apiUrl), {
      method: 'POST',
      headers: user.authorizationHeaders(type),
      body: text,
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    console.log('Successfully created fragment', { data });
    // Useful for proving the Location header is set correctly (Assignment 2 report)
    console.log('Location header:', res.headers.get('Location'));
    return data;
  } catch (err) {
    console.error('Unable to call POST /v1/fragments', { err });
  }
}