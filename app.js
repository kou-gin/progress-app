'use strict';

const STORAGE_KEY = 'progress-manager-v1';
const THEME_KEY   = 'progress-manager-theme';

const STATUS_LABEL = {
  active:  '進行中',
  done:    '完了',
  stopped: '停止',
  pending: '未着手',
};

// ─── State ────────────────────────────────────────────────────
let projects = [];
let filterStatus = 'all';
let searchQuery  = '';
let pendingDeleteId = null;

// ─── Storage ──────────────────────────────────────────────────
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    projects = raw ? JSON.parse(raw) : [];
  } catch {
    projects = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

// ─── DOM refs ─────────────────────────────────────────────────
const grid          = document.getElementById('projects-grid');
const searchInput   = document.getElementById('search-input');
const filterBtns    = document.querySelectorAll('.filter-btn');
const modalOverlay  = document.getElementById('modal-overlay');
const deleteOverlay = document.getElementById('delete-overlay');
const projectForm   = document.getElementById('project-form');
const modalTitle    = document.getElementById('modal-title');
const fId           = document.getElementById('project-id');
const fTitle        = document.getElementById('f-title');
const fStatus       = document.getElementById('f-status');
const fProgress     = document.getElementById('f-progress');
const fNext         = document.getElementById('f-next');
const fMemo         = document.getElementById('f-memo');
const themeToggle   = document.getElementById('theme-toggle');
const addBtn        = document.getElementById('add-btn');

// Stats
const statAll     = document.getElementById('stat-all');
const statActive  = document.getElementById('stat-active');
const statDone    = document.getElementById('stat-done');
const statStopped = document.getElementById('stat-stopped');
const statPending = document.getElementById('stat-pending');

// ─── Theme ────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ─── Filter helpers ───────────────────────────────────────────
function getFiltered() {
  const q = searchQuery.toLowerCase();
  return projects.filter(p => {
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchSearch = !q
      || p.title.toLowerCase().includes(q)
      || (p.memo   || '').toLowerCase().includes(q)
      || (p.progress || '').toLowerCase().includes(q)
      || (p.next   || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });
}

// ─── Render ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderCard(p) {
  const hasProg = p.progress && p.progress.trim();
  const hasNext = p.next     && p.next.trim();
  const hasMemo = p.memo     && p.memo.trim();

  const fields = [
    hasProg ? `<div class="card-field">
      <span class="card-field-label">進捗状況</span>
      <span class="card-field-value">${escHtml(p.progress)}</span>
    </div>` : '',
    hasNext ? `<div class="card-field">
      <span class="card-field-label">次のアクション</span>
      <span class="card-field-value card-field-value--next">${escHtml(p.next)}</span>
    </div>` : '',
    hasMemo ? `<div class="card-field">
      <span class="card-field-label">メモ</span>
      <span class="card-field-value">${escHtml(p.memo)}</span>
    </div>` : '',
  ].join('');

  return `
    <article class="card card--${escHtml(p.status)}" data-id="${escHtml(p.id)}">
      <div class="card-header">
        <h3 class="card-title">${escHtml(p.title)}</h3>
        <div class="card-menu">
          <button class="card-btn js-edit" data-id="${escHtml(p.id)}" aria-label="編集">編集</button>
          <button class="card-btn card-btn--del js-delete" data-id="${escHtml(p.id)}" aria-label="削除">削除</button>
        </div>
      </div>
      <div class="card-badge-row">
        <span class="badge badge--${escHtml(p.status)}">${STATUS_LABEL[p.status] ?? p.status}</span>
        <span class="card-date">${formatDate(p.updatedAt)}</span>
      </div>
      ${fields ? `<div class="card-body">${fields}</div>` : ''}
    </article>`;
}

function updateStats() {
  const counts = { active: 0, done: 0, stopped: 0, pending: 0 };
  projects.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
  statAll.textContent     = `全 ${projects.length}`;
  statActive.textContent  = `進行中 ${counts.active}`;
  statDone.textContent    = `完了 ${counts.done}`;
  statStopped.textContent = `停止 ${counts.stopped}`;
  statPending.textContent = `未着手 ${counts.pending}`;
}

function render() {
  const filtered = getFiltered();
  updateStats();

  if (!filtered.length) {
    const msg = searchQuery || filterStatus !== 'all'
      ? '条件に一致するプロジェクトがありません'
      : 'プロジェクトを追加してください';
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">◉</span>
        <p class="empty-state-text">${msg}</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(renderCard).join('');

  grid.querySelectorAll('.js-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  grid.querySelectorAll('.js-delete').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
  });
}

// ─── Modal helpers ────────────────────────────────────────────
function openModal() {
  modalOverlay.classList.add('open');
  fTitle.focus();
}

function closeModal() {
  modalOverlay.classList.remove('open');
  projectForm.reset();
  fId.value = '';
}

function openAddModal() {
  modalTitle.textContent = '新規プロジェクト';
  document.getElementById('form-submit').textContent = '追加する';
  fStatus.value = 'pending';
  openModal();
}

function openEditModal(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  modalTitle.textContent = 'プロジェクトを編集';
  document.getElementById('form-submit').textContent = '保存する';
  fId.value       = p.id;
  fTitle.value    = p.title;
  fStatus.value   = p.status;
  fProgress.value = p.progress || '';
  fNext.value     = p.next     || '';
  fMemo.value     = p.memo     || '';
  openModal();
}

function openDeleteModal(id) {
  pendingDeleteId = id;
  deleteOverlay.classList.add('open');
}

function closeDeleteModal() {
  deleteOverlay.classList.remove('open');
  pendingDeleteId = null;
}

// ─── CRUD ─────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function handleFormSubmit(e) {
  e.preventDefault();
  const title = fTitle.value.trim();
  if (!title) { fTitle.focus(); return; }

  const now = new Date().toISOString();
  const id  = fId.value;

  if (id) {
    const idx = projects.findIndex(p => p.id === id);
    if (idx !== -1) {
      projects[idx] = {
        ...projects[idx],
        title,
        status:   fStatus.value,
        progress: fProgress.value.trim(),
        next:     fNext.value.trim(),
        memo:     fMemo.value.trim(),
        updatedAt: now,
      };
    }
  } else {
    projects.unshift({
      id:        uid(),
      title,
      status:    fStatus.value,
      progress:  fProgress.value.trim(),
      next:      fNext.value.trim(),
      memo:      fMemo.value.trim(),
      createdAt: now,
      updatedAt: now,
    });
  }

  save();
  closeModal();
  render();
}

function handleDeleteConfirm() {
  if (!pendingDeleteId) return;
  projects = projects.filter(p => p.id !== pendingDeleteId);
  save();
  closeDeleteModal();
  render();
}

// ─── Event listeners ──────────────────────────────────────────
themeToggle.addEventListener('click', toggleTheme);
addBtn.addEventListener('click', openAddModal);

projectForm.addEventListener('submit', handleFormSubmit);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('form-cancel').addEventListener('click', closeModal);

document.getElementById('delete-confirm').addEventListener('click', handleDeleteConfirm);
document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);

// Close modals on overlay click
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
deleteOverlay.addEventListener('click', e => { if (e.target === deleteOverlay) closeDeleteModal(); });

// Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeDeleteModal();
  }
});

// Filter buttons
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterStatus = btn.dataset.status;
    render();
  });
});

// Search
let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery = searchInput.value;
    render();
  }, 150);
});

// ─── Init ─────────────────────────────────────────────────────
(function init() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(savedTheme);
  load();
  render();
})();
