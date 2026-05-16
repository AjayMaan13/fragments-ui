// src/app.js

import { signIn, signOut, getUser } from './auth';
import { getUserFragments } from './api';

async function init() {
  // Get our UI elements
  const userSection = document.querySelector('#user');
  const loginBtn = document.querySelector('#login');
  const logoutBtn = document.querySelector('#logout');

  loginBtn.onclick = () => signIn();

  logoutBtn.onclick = async () => {
    await signOut();
    userSection.hidden = true;
    loginBtn.disabled = false;
  };

  // See if we're signed in (i.e., we'll have a `user` object)
  const user = await getUser();
  if (!user) {
    return;
  }

  // Update the UI to welcome the user
  userSection.hidden = false;

  // Show the user's username
  userSection.querySelector('.username').innerText = user.username;

  // Disable the Login button
  loginBtn.disabled = true;

  // Do an authenticated request to the fragments API server and log the result
  const userFragments = await getUserFragments(user);
}

// Wait for the DOM to be ready, then start the app
addEventListener('DOMContentLoaded', init);
