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
import { FORMATS, FORMAT_LABELS, TYPE_LABELS } from './formats';

// Save a Blob to the user's computer as a file
function download(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Show a short message at the bottom of the screen
function toast(message, isError = false) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3000);
}

// 1536 -> "1.5 KB"
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
  const fileName = document.querySelector('#file-name');
  const fileClear = document.querySelector('#file-clear');
  const fragmentCount = document.querySelector('#fragment-count');
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

  // Fetch and display the user's fragments (newest first), with full metadata
  async function refreshFragments() {
    const data = await getUserFragments(user);
    if (!data) return toast('Could not load your fragments', true);

    const fragments = data.fragments.sort((a, b) => new Date(b.created) - new Date(a.created));
    fragmentCount.textContent = fragments.length ? `(${fragments.length})` : '';
    fragmentsList.innerHTML = fragments.length
      ? ''
      : `<div class="empty-state">
           <i class="ti ti-stack-2" aria-hidden="true"></i>
           <strong>No fragments yet</strong>
           <span>Create your first one above.</span>
         </div>`;
    fragments.forEach((f) => fragmentsList.appendChild(renderCard(f)));
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

  // A small button with an icon and a label
  function makeButton(icon, label, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i> ${label}`;
    return button;
  }

  // Build a single fragment card: what it is, its stats, then its actions
  function renderCard(f) {
    const baseType = f.type.split(';')[0];
    const views = f.viewCount ?? 0;
    const card = document.createElement('div');
    card.className = 'fragment-card';
    card.innerHTML = `
      <div class="fragment-card-top">
        <span class="badge ${badgeClass(f.type)}">${TYPE_LABELS[baseType] || baseType}</span>
        <span class="fragment-size">${formatSize(f.size)}</span>
      </div>
      <p class="fragment-id" title="${f.id}">${f.id.slice(0, 8)}</p>
      <div class="chips">
        <span class="chip" title="Created"><i class="ti ti-clock" aria-hidden="true"></i>${formatDate(f.created)}</span>
        <span class="chip" title="Times its data was read"><i class="ti ti-eye" aria-hidden="true"></i>${views} ${views === 1 ? 'view' : 'views'}</span>
        ${
          f.expiresAt
            ? `<span class="chip chip-expiry" title="Deleted automatically after this"><i class="ti ti-hourglass" aria-hidden="true"></i>Expires ${formatDate(new Date(f.expiresAt * 1000).toISOString())}</span>`
            : ''
        }
      </div>
      <div class="fragment-footer"><div class="card-actions"></div></div>
    `;

    const footer = card.querySelector('.fragment-footer');
    const actions = card.querySelector('.card-actions');

    const updateBtn = makeButton('ti-edit', 'Update');
    updateBtn.onclick = () => startEdit(f, actions);

    const shareBtn = makeButton('ti-share', 'Share');
    shareBtn.onclick = async () => {
      const open = footer.querySelector('.share-box');
      if (open) return open.remove();

      const share = await shareUserFragment(user, f.id);
      if (!share) return toast('Could not create a share link', true);

      const box = document.createElement('div');
      box.className = 'share-box';
      box.innerHTML = `
        <div class="share-row">
          <input readonly aria-label="Share link" />
          <button type="button"><i class="ti ti-copy" aria-hidden="true"></i> Copy</button>
        </div>
        <p class="share-note">Anyone with this link can view it for ${Math.round(share.expiresIn / 60)} min.</p>
      `;
      const input = box.querySelector('input');
      input.value = share.url;
      box.querySelector('button').onclick = async () => {
        try {
          await navigator.clipboard.writeText(share.url);
          toast('Link copied');
        } catch {
          input.select();
          toast('Press Cmd/Ctrl+C to copy the link');
        }
      };
      footer.append(box);
    };

    const deleteBtn = makeButton('ti-trash', 'Delete', 'btn-danger');
    deleteBtn.onclick = async () => {
      if (!confirm(`Delete fragment ${f.id.slice(0, 8)}?`)) return;
      const result = await deleteUserFragment(user, f.id);
      toast(result ? 'Fragment deleted' : 'Could not delete the fragment', !result);
      await refreshFragments();
    };

    actions.append(updateBtn, shareBtn, deleteBtn);

    // "Download as..." converts the fragment and saves the result. Images can
    // also be shrunk by typing a width first.
    const targets = FORMATS[baseType] || [];
    if (targets.length) {
      const row = document.createElement('div');
      row.className = 'download-row';

      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Download as');
      select.innerHTML =
        '<option value="">Download as...</option>' +
        targets.map((ext) => `<option value="${ext}">${FORMAT_LABELS[ext]}</option>`).join('');

      const width = document.createElement('input');
      width.type = 'number';
      width.min = 1;
      width.placeholder = 'Width (px)';
      width.setAttribute('aria-label', 'Resize to this width in pixels (optional)');

      select.onchange = async () => {
        const ext = select.value;
        select.value = '';
        if (!ext) return;
        select.disabled = true;
        const blob = await convertUserFragment(user, f.id, ext, width.value);
        select.disabled = false;
        if (!blob) return toast(`Could not convert to ${FORMAT_LABELS[ext]}`, true);
        download(blob, `${f.id.slice(0, 8)}${ext}`);
      };

      row.append(select);
      if (f.type.startsWith('image/')) row.append(width);
      footer.append(row);
    }
    return card;
  }

  // Replace a row's action buttons with an inline edit form. Image fragments
  // get a file picker; every other (text-based) type gets a pre-filled
  // textarea, since a fragment's type can't change on update.
  async function startEdit(f, actionsTd) {
    actionsTd.classList.add('editing');
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
        const result = await updateUserFragment(user, f.id, buffer, f.type);
        toast(result ? 'Fragment updated' : 'Could not update the fragment', !result);
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
        const result = await updateUserFragment(user, f.id, textarea.value, f.type);
        toast(result ? 'Fragment updated' : 'Could not update the fragment', !result);
        await refreshFragments();
      };

      actionsTd.innerHTML = '';
      actionsTd.append(textarea, saveBtn, cancelBtn);
    }
  }

  // Attaching an image replaces the text fields: show that clearly
  function updateFileState() {
    const file = fragmentFile.files[0];
    fileName.textContent = file ? file.name : '';
    fileName.hidden = fileClear.hidden = !file;
    fragmentText.disabled = fragmentType.disabled = !!file;
  }
  fragmentFile.onchange = updateFileState;
  fileClear.onclick = () => {
    fragmentFile.value = '';
    updateFileState();
  };

  // Handle create fragment form submission (text or image file)
  createForm.onsubmit = async (e) => {
    e.preventDefault();
    const file = fragmentFile.files[0];
    const expiresIn = fragmentExpires.value;
    let result;

    if (file) {
      const buffer = await file.arrayBuffer();
      result = await postUserFragment(user, buffer, file.type, expiresIn);
      if (result) fileClear.onclick();
    } else {
      const text = fragmentText.value.trim();
      if (!text) return toast('Enter some content first', true);
      result = await postUserFragment(user, text, fragmentType.value, expiresIn);
      if (result) fragmentText.value = '';
    }

    toast(result ? 'Fragment created' : 'Could not create the fragment', !result);
    if (result) fragmentExpires.value = '';
    await refreshFragments();
  };

  await refreshFragments();
}

// Wait for the DOM to be ready, then start the app
addEventListener('DOMContentLoaded', init);
