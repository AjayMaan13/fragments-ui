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

// POST a new fragment of the given type for the authenticated user.
// `data` can be a string (text/json/etc.) or an ArrayBuffer/Blob (images).
export async function postUserFragment(user, data, type = 'text/plain') {
  console.log('Posting new fragment...', { type });
  try {
    const res = await fetch(new URL('/v1/fragments', apiUrl), {
      method: 'POST',
      headers: user.authorizationHeaders(type),
      body: data,
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    const result = await res.json();
    console.log('Successfully created fragment', { result });
    // Useful for proving the Location header is set correctly (Assignment 2 report)
    console.log('Location header:', res.headers.get('Location'));
    return result;
  } catch (err) {
    console.error('Unable to call POST /v1/fragments', { err });
  }
}

// GET the raw data for one of the authenticated user's fragments (used to
// pre-fill the update form with the fragment's current content)
export async function getUserFragmentData(user, id) {
  console.log('Fetching fragment data...', { id });
  try {
    const res = await fetch(new URL(`/v1/fragments/${id}`, apiUrl), {
      headers: { Authorization: `Bearer ${user.idToken}` },
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return await res.text();
  } catch (err) {
    console.error('Unable to call GET /v1/fragments/:id', { err });
  }
}

// PUT new data for an existing fragment. The Content-Type must match the
// fragment's existing type, since a fragment's type is immutable.
// `data` can be a string or an ArrayBuffer/Blob (images).
export async function updateUserFragment(user, id, data, type) {
  console.log('Updating fragment...', { id, type });
  try {
    const res = await fetch(new URL(`/v1/fragments/${id}`, apiUrl), {
      method: 'PUT',
      headers: user.authorizationHeaders(type),
      body: data,
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    const result = await res.json();
    console.log('Successfully updated fragment', { result });
    return result;
  } catch (err) {
    console.error('Unable to call PUT /v1/fragments/:id', { err });
  }
}

// DELETE an existing fragment for the authenticated user
export async function deleteUserFragment(user, id) {
  console.log('Deleting fragment...', { id });
  try {
    const res = await fetch(new URL(`/v1/fragments/${id}`, apiUrl), {
      method: 'DELETE',
      headers: user.authorizationHeaders(),
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    const result = await res.json();
    console.log('Successfully deleted fragment', { result });
    return result;
  } catch (err) {
    console.error('Unable to call DELETE /v1/fragments/:id', { err });
  }
}