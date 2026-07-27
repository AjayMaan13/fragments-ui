// src/app.js

import { signIn, signOut, getUser } from './auth';
import {
  getUserFragments,
  postUserFragment,
  getUserFragmentData,
  updateUserFragment,
  deleteUserFragment,
} from './api';

async function init() {
  // Get our UI elements
  const userSection = document.querySelector('#user');
  const loginBtn = document.querySelector('#login');
  const logoutBtn = document.querySelector('#logout');
  const createForm = document.querySelector('#create-form');
  const fragmentType = document.querySelector('#fragment-type');
  const fragmentText = document.querySelector('#fragment-text');
  const fragmentFile = document.querySelector('#fragment-file');
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
      fragmentsList.appendChild(renderRow(f));
    });
  }

  // Build a single <tr> for a fragment, with working Update/Delete buttons
  function renderRow(f) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${f.id}</td><td>${f.type}</td><td>${f.size}</td><td>${f.created}</td><td>${f.updated}</td><td class="actions"></td>`;

    const actionsTd = tr.querySelector('.actions');

    const updateBtn = document.createElement('button');
    updateBtn.type = 'button';
    updateBtn.innerText = 'Update';
    updateBtn.onclick = () => startEdit(f, actionsTd);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.innerText = 'Delete';
    deleteBtn.onclick = async () => {
      if (!confirm(`Delete fragment ${f.id}?`)) return;
      await deleteUserFragment(user, f.id);
      await refreshFragments();
    };

    actionsTd.append(updateBtn, deleteBtn);
    return tr;
  }

  // Replace a row's action buttons with an inline edit form. Image fragments
  // get a file picker; every other (text-based) type gets a pre-filled
  // textarea, since a fragment's type can't change on update.
  async function startEdit(f, actionsTd) {
    actionsTd.innerHTML = 'Loading...';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.innerText = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.innerText = 'Cancel';
    cancelBtn.onclick = () => refreshFragments();

    if (f.type.startsWith('image/')) {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = f.type;

      saveBtn.onclick = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        const buffer = await file.arrayBuffer();
        await updateUserFragment(user, f.id, buffer, f.type);
        await refreshFragments();
      };

      actionsTd.innerHTML = '';
      actionsTd.append(fileInput, saveBtn, cancelBtn);
    } else {
      const currentData = (await getUserFragmentData(user, f.id)) || '';

      const textarea = document.createElement('textarea');
      textarea.rows = 3;
      textarea.value = currentData;

      saveBtn.onclick = async () => {
        await updateUserFragment(user, f.id, textarea.value, f.type);
        await refreshFragments();
      };

      actionsTd.innerHTML = '';
      actionsTd.append(textarea, document.createElement('br'), saveBtn, cancelBtn);
    }
  }

  // Handle create fragment form submission (text or image file)
  createForm.onsubmit = async (e) => {
    e.preventDefault();
    const file = fragmentFile.files[0];

    if (file) {
      const buffer = await file.arrayBuffer();
      await postUserFragment(user, buffer, file.type);
      fragmentFile.value = '';
    } else {
      const text = fragmentText.value.trim();
      if (!text) return;
      await postUserFragment(user, text, fragmentType.value);
      fragmentText.value = '';
    }

    await refreshFragments();
  };

  await refreshFragments();
}

// Wait for the DOM to be ready, then start the app
addEventListener('DOMContentLoaded', init);
