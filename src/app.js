// src/app.js

import { signIn, signOut, getUser } from './auth';
import { getUserFragments, postUserFragment } from './api';

async function init() {
  // Get our UI elements
  const userSection = document.querySelector('#user');
  const loginBtn = document.querySelector('#login');
  const logoutBtn = document.querySelector('#logout');
  const createForm = document.querySelector('#create-form');
  const fragmentType = document.querySelector('#fragment-type');
  const fragmentText = document.querySelector('#fragment-text');
  const fragmentsList = document.querySelector('#fragments-list');

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

  // Fetch and display the user's fragments, with full metadata
  async function refreshFragments() {
    const data = await getUserFragments(user);
    fragmentsList.innerHTML = '';
    (data?.fragments || []).forEach((f) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${f.id}</td><td>${f.type}</td><td>${f.size}</td><td>${f.created}</td><td>${f.updated}</td>`;
      fragmentsList.appendChild(tr);
    });
  }

  // Handle create fragment form submission
  createForm.onsubmit = async (e) => {
    e.preventDefault();
    const text = fragmentText.value.trim();
    if (!text) return;
    await postUserFragment(user, text, fragmentType.value);
    fragmentText.value = '';
    await refreshFragments();
  };

  await refreshFragments();
}

// Wait for the DOM to be ready, then start the app
addEventListener('DOMContentLoaded', init);
