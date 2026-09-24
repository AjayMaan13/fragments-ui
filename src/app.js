// src/app.js

import { signIn, signOut, getUser } from './auth';
import {
  getUserFragments,
  postUserFragment,
  getUserFragmentData,
  updateUserFragment,
  deleteUserFragment,
  convertUserFragment,
  shareUserFragment,
} from './api';
import { FORMATS } from './formats';

// Save a Blob to the user's computer as a file
function download(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Apply a light/dark theme choice to the document and remember it
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.querySelector('#theme-toggle i');
  if (icon) {
    icon.className = theme === 'dark' ? 'ti ti-sun' : 'ti ti-moon';
  }
}

function initThemeToggle() {
  const themeToggle = document.querySelector('#theme-toggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedTheme = localStorage.getItem('theme') || (prefersDark ? 'dark' : 'light');
  applyTheme(savedTheme);

  themeToggle.onclick = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
  };
}

async function init() {
  initThemeToggle();

  // Get our UI elements
  const userSection = document.querySelector('#user');
  const loginBtn = document.querySelector('#login');
  const logoutBtn = document.querySelector('#logout');
  const usernameBadge = document.querySelector('#username-badge');
  const createForm = document.querySelector('#create-form');
  const fragmentType = document.querySelector('#fragment-type');
  const fragmentText = document.querySelector('#fragment-text');
  const fragmentFile = document.querySelector('#fragment-file');
  const fragmentExpires = document.querySelector('#fragment-expires');
  const fragmentsList = document.querySelector('#fragments-list');

  loginBtn.onclick = () => signIn();

  logoutBtn.onclick = async () => {
    await signOut();
    userSection.hidden = true;
    usernameBadge.hidden = true;
    logoutBtn.hidden = true;
    loginBtn.hidden = false;
  };

  // See if we're signed in (i.e., we'll have a `user` object)
  const user = await getUser();
  if (!user) {
    return;
  }

  // Update the UI to welcome the user
  userSection.hidden = false;
  usernameBadge.hidden = false;
  logoutBtn.hidden = false;
  loginBtn.hidden = true;

  // Show the user's username
  usernameBadge.querySelector('.username').innerText = user.username;

  // Fetch and display the user's fragments, with full metadata
  async function refreshFragments() {
    const data = await getUserFragments(user);
    fragmentsList.innerHTML = '';
    (data?.fragments || []).forEach((f) => {
      fragmentsList.appendChild(renderCard(f));
    });
  }

  // Maps a fragment's mime type to a badge color class for quick scanning
  function badgeClass(type) {
    if (type.startsWith('image/')) return 'badge-image';
    if (type === 'application/json' || type === 'application/yaml') return 'badge-data';
    if (type === 'text/csv') return 'badge-csv';
    return 'badge-text';
  }

  // Formats an ISO timestamp as e.g. "Jul 21, 14:24"
  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Build a single fragment card, with working Update/Delete buttons
  function renderCard(f) {
    const card = document.createElement('div');
    card.className = 'fragment-card';
    card.innerHTML = `
      <div class="fragment-card-top">
        <span class="badge ${badgeClass(f.type)}">${f.type}</span>
        <span class="fragment-size">${f.size} B</span>
      </div>
      <p class="fragment-id" title="${f.id}">${f.id}</p>
      <p class="fragment-meta">
        <i class="ti ti-clock" aria-hidden="true"></i>
        Created ${formatDate(f.created)}
      </p>
      <p class="fragment-meta">
        <i class="ti ti-eye" aria-hidden="true"></i>
        ${f.viewCount ?? 0} ${f.viewCount === 1 ? 'view' : 'views'}${
          f.expiresAt ? ` · expires ${formatDate(new Date(f.expiresAt * 1000).toISOString())}` : ''
        }
      </p>
      <div class="fragment-actions"></div>
    `;

    const actions = card.querySelector('.fragment-actions');

    const updateBtn = document.createElement('button');
    updateBtn.type = 'button';
    updateBtn.innerHTML = '<i class="ti ti-edit" aria-hidden="true"></i> Update';
    updateBtn.onclick = () => startEdit(f, actions);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i> Delete';
    deleteBtn.onclick = async () => {
      if (!confirm(`Delete fragment ${f.id}?`)) return;
      await deleteUserFragment(user, f.id);
      await refreshFragments();
    };

    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.innerHTML = '<i class="ti ti-share" aria-hidden="true"></i> Share';
    shareBtn.onclick = async () => {
      const share = await shareUserFragment(user, f.id);
      if (!share) return alert('Could not create a share link');
      prompt(`Anyone with this link can view it for ${Math.round(share.expiresIn / 60)} min:`, share.url);
    };

    actions.append(updateBtn, shareBtn, deleteBtn);

    // "Convert to..." downloads the fragment in another format. Images can also
    // be shrunk by typing a width first.
    const targets = FORMATS[f.type.split(';')[0]] || [];
    if (targets.length) {
      const convertRow = document.createElement('div');
      convertRow.className = 'fragment-actions';

      const select = document.createElement('select');
      select.innerHTML =
        '<option value="">Convert to...</option>' +
        targets.map((ext) => `<option value="${ext}">${ext}</option>`).join('');

      const width = document.createElement('input');
      width.type = 'number';
      width.min = 1;
      width.placeholder = 'width (px)';

      select.onchange = async () => {
        const ext = select.value;
        select.value = '';
        if (!ext) return;
        const blob = await convertUserFragment(user, f.id, ext, width.value);
        if (!blob) return alert(`Could not convert to ${ext}`);
        download(blob, `${f.id}${ext}`);
      };

      convertRow.append(select);
      if (f.type.startsWith('image/')) convertRow.append(width);
      card.append(convertRow);
    }
    return card;
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
    const expiresIn = fragmentExpires.value;

    if (file) {
      const buffer = await file.arrayBuffer();
      await postUserFragment(user, buffer, file.type, expiresIn);
      fragmentFile.value = '';
    } else {
      const text = fragmentText.value.trim();
      if (!text) return;
      await postUserFragment(user, text, fragmentType.value, expiresIn);
      fragmentText.value = '';
    }
    fragmentExpires.value = '';

    await refreshFragments();
  };

  await refreshFragments();
}

// Wait for the DOM to be ready, then start the app
addEventListener('DOMContentLoaded', init);
