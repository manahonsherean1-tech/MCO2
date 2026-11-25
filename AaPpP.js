const LOCAL_DB_KEY = 'lost_and_found_db_v1';
const API_BASE = '/api/items';

// DOM References
const form = document.getElementById('itemForm');
const editIdInput = document.getElementById('editId');
const formHeading = document.getElementById('formHeading');
const formSubtext = document.getElementById('formSubtext');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const itemsContainer = document.getElementById('itemsContainer');
const countLabel = document.getElementById('countLabel');
const storageBadge = document.getElementById('storageBadge');
const toastEl = document.getElementById('toast');

const searchInput = document.getElementById('searchInput');
const typeFilter = document.getElementById('typeFilter');
const statusFilter = document.getElementById('statusFilter');
const sortSelect = document.getElementById('sortSelect');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');

const statTotal = document.getElementById('statTotal');
const statLost = document.getElementById('statLost');
const statFound = document.getElementById('statFound');
const statResolved = document.getElementById('statResolved');

let useBackendApi = false;
let visibleItems = [];
let toastTimer = null;

// Initialize default date to today
function setTodayDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('incident_date').value = `${yyyy}-${mm}-${dd}`;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

// --- LocalStorage Database Helpers (Fallback when running standalone HTML) ---
function seedLocalDb() {
  const existing = localStorage.getItem(LOCAL_DB_KEY);
  if (existing !== null) return;
  const sampleData = [
    {
      id: 1,
      report_type: 'found',
      title: 'Scientific Calculator (Casio fx-991EX)',
      category: 'Electronics',
      description: 'Found on a desk near the back row after morning lecture.',
      location_name: 'Room 204',
      incident_date: '2026-11-24',
      reporter_name: 'Marco Santos',
      contact_info: '0917-555-0142',
      status: 'open',
      created_at: '2026-11-24T09:15:00.000Z'
    },
    {
      id: 2,
      report_type: 'lost',
      title: 'Navy Blue Umbrella',
      category: 'Accessories',
      description: 'Compact foldable umbrella with wooden handle.',
      location_name: 'Main Gate Lobby',
      incident_date: '2026-11-23',
      reporter_name: 'Elena Reyes',
      contact_info: 'elena.reyes@example.com',
      status: 'open',
      created_at: '2026-11-23T14:30:00.000Z'
    },
    {
      id: 3,
      report_type: 'found',
      title: 'Keychain with Dorm Key & Mini Flashlight',
      category: 'Keys',
      description: 'Silver ring with two keys and a small red tag.',
      location_name: 'Student Center',
      incident_date: '2026-11-22',
      reporter_name: 'David Cruz',
      contact_info: '0918-555-0199',
      status: 'claimed',
      created_at: '2026-11-22T11:00:00.000Z'
    }
  ];
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(sampleData));
}

function readLocalItems() {
  seedLocalDb();
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalItems(items) {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(items));
}

function filterAndSortLocal(allItems, { search, type, status, sort }) {
  let result = [...allItems];

  if (type) {
    result = result.filter((item) => item.report_type === type);
  }
  if (status) {
    result = result.filter((item) => item.status === status);
  }
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((item) =>
      [item.title, item.description, item.location_name, item.category, item.reporter_name]
        .some((field) => String(field || '').toLowerCase().includes(q))
    );
  }

  switch (sort) {
    case 'oldest':
      result.sort((a, b) => Number(a.id) - Number(b.id));
      break;
    case 'date_desc':
      result.sort((a, b) => String(b.incident_date).localeCompare(String(a.incident_date)) || Number(b.id) - Number(a.id));
      break;
    case 'date_asc':
      result.sort((a, b) => String(a.incident_date).localeCompare(String(b.incident_date)) || Number(a.id) - Number(b.id));
      break;
    case 'title_asc':
      result.sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' }));
      break;
    case 'title_desc':
      result.sort((a, b) => String(b.title).localeCompare(String(a.title), undefined, { sensitivity: 'base' }));
      break;
    case 'type_asc':
      result.sort((a, b) => String(a.report_type).localeCompare(String(b.report_type)) || Number(b.id) - Number(a.id));
      break;
    case 'status_asc':
      result.sort((a, b) => String(a.status).localeCompare(String(b.status)) || Number(b.id) - Number(a.id));
      break;
    case 'newest':
    default:
      result.sort((a, b) => Number(b.id) - Number(a.id));
      break;
  }

  return result;
}

// --- Backend Detection & Data Operations ---
async function detectBackend() {
  try {
    const res = await fetch(`${API_BASE}?limit=1`, { cache: 'no-store' });
    if (res.ok) {
      useBackendApi = true;
      storageBadge.textContent = 'SQLite API Connected';
      return;
    }
  } catch {
    // Fallback to localStorage
  }
  useBackendApi = false;
  storageBadge.textContent = 'Browser LocalStorage DB';
}

async function loadItems() {
  const query = {
    search: searchInput.value.trim(),
    type: typeFilter.value,
    status: statusFilter.value,
    sort: sortSelect.value
  };

  if (useBackendApi) {
    try {
      const params = new URLSearchParams();
      if (query.search) params.set('search', query.search);
      if (query.type) params.set('type', query.type);
      if (query.status) params.set('status', query.status);
      if (query.sort) params.set('sort', query.sort);

      const [filteredRes, allRes] = await Promise.all([
        fetch(`${API_BASE}?${params.toString()}`),
        fetch(API_BASE)
      ]);
      visibleItems = await filteredRes.json();
      const allItems = await allRes.json();
      updateStats(allItems);
      renderItems(visibleItems);
      return;
    } catch {
      useBackendApi = false;
      storageBadge.textContent = 'Browser LocalStorage DB';
    }
  }

  const allLocal = readLocalItems();
  updateStats(allLocal);
  visibleItems = filterAndSortLocal(allLocal, query);
  renderItems(visibleItems);
}

function updateStats(items) {
  statTotal.textContent = items.length;
  statLost.textContent = items.filter((i) => i.report_type === 'lost').length;
  statFound.textContent = items.filter((i) => i.report_type === 'found').length;
  statResolved.textContent = items.filter((i) => i.status === 'claimed' || i.status === 'returned').length;
}

function renderItems(items) {
  countLabel.textContent = `${items.length} record(s) displayed`;

  if (!items.length) {
    itemsContainer.innerHTML = `
      <div class="card empty-state">
        <strong>No matching records found</strong>
        <p class="empty-subtext">Try adjusting your search keyword, filters, or add a new report.</p>
      </div>
    `;
    return;
  }

  itemsContainer.innerHTML = items.map((item) => {
    const nextStatus = item.report_type === 'found' ? 'claimed' : 'returned';
    const resolveLabel = item.report_type === 'found' ? 'Mark Claimed' : 'Mark Returned';

    return `
      <article class="card item-card ${esc(item.report_type)}">
        <div class="item-top">
          <div class="badges">
            <span class="badge badge-${esc(item.report_type)}">${esc(item.report_type)}</span>
            <span class="badge badge-${esc(item.status)}">${esc(item.status)}</span>
            <span class="item-title">${esc(item.title)}</span>
          </div>
          <small class="item-meta-right">#${esc(item.id)} • ${esc(item.category)}</small>
        </div>

        <p class="item-desc">${esc(item.description)}</p>

        <div class="meta">
          <strong>Location:</strong> ${esc(item.location_name)} &nbsp;|&nbsp;
          <strong>Date:</strong> ${esc(item.incident_date)}<br />
          <strong>Reporter:</strong> ${esc(item.reporter_name)} (${esc(item.contact_info)})
        </div>

        <div class="actions">
          <button type="button" class="btn-edit" data-action="edit" data-id="${Number(item.id)}">Edit</button>
          ${
            item.status === 'open'
              ? `<button type="button" class="btn-resolve" data-action="status" data-id="${Number(item.id)}" data-status="${nextStatus}">${resolveLabel}</button>`
              : `<button type="button" class="btn-reopen" data-action="status" data-id="${Number(item.id)}" data-status="open">Reopen</button>`
          }
          <button type="button" class="btn-delete" data-action="delete" data-id="${Number(item.id)}">Delete</button>
        </div>
      </article>
    `;
  }).join('');
}

// Event delegation for item card buttons
itemsContainer.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const { action, id, status } = btn.dataset;
  if (action === 'edit') {
    startEdit(Number(id));
  } else if (action === 'status') {
    await quickStatus(Number(id), status);
  } else if (action === 'delete') {
    await deleteItem(Number(id));
  }
});

// --- Form Create & Update Handlers ---
function startEdit(id) {
  const item = visibleItems.find((x) => Number(x.id) === Number(id));
  if (!item) return;

  editIdInput.value = item.id;
  document.getElementById('report_type').value = item.report_type;
  document.getElementById('title').value = item.title;
  document.getElementById('category').value = item.category || 'General';
  document.getElementById('location_name').value = item.location_name;
  document.getElementById('incident_date').value = item.incident_date;
  document.getElementById('description').value = item.description;
  document.getElementById('reporter_name').value = item.reporter_name;
  document.getElementById('contact_info').value = item.contact_info;
  document.getElementById('status').value = item.status || 'open';

  formHeading.textContent = `Edit Report #${item.id}`;
  formSubtext.textContent = 'Update fields and click Save Changes.';
  submitBtn.textContent = 'Save Changes';
  cancelEditBtn.style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  form.reset();
  editIdInput.value = '';
  document.getElementById('category').value = 'General';
  document.getElementById('status').value = 'open';
  setTodayDate();
  formHeading.textContent = 'New Report';
  formSubtext.textContent = 'Fill in the item details below to save a record.';
  submitBtn.textContent = 'Add Item';
  cancelEditBtn.style.display = 'none';
}

cancelEditBtn.addEventListener('click', resetForm);

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = editIdInput.value;
  const payload = {
    report_type: document.getElementById('report_type').value,
    title: document.getElementById('title').value.trim(),
    category: document.getElementById('category').value.trim() || 'General',
    location_name: document.getElementById('location_name').value.trim(),
    incident_date: document.getElementById('incident_date').value,
    description: document.getElementById('description').value.trim(),
    reporter_name: document.getElementById('reporter_name').value.trim(),
    contact_info: document.getElementById('contact_info').value.trim(),
    status: document.getElementById('status').value
  };

  if (useBackendApi) {
    const res = await fetch(id ? `${API_BASE}/${id}` : API_BASE, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Failed to save item.');
      return;
    }
    resetForm();
    await loadItems();
    showToast(id ? `Report #${id} updated.` : 'New report added.');
    return;
  }

  const items = readLocalItems();
  if (id) {
    const idx = items.findIndex((x) => Number(x.id) === Number(id));
    if (idx !== -1) {
      items[idx] = { ...items[idx], ...payload };
      writeLocalItems(items);
      showToast(`Report #${id} updated.`);
    }
  } else {
    const nextId = items.length ? Math.max(...items.map((x) => Number(x.id) || 0)) + 1 : 1;
    items.push({
      id: nextId,
      ...payload,
      created_at: new Date().toISOString()
    });
    writeLocalItems(items);
    showToast('New report added.');
  }

  resetForm();
  await loadItems();
});

async function quickStatus(id, newStatus) {
  if (useBackendApi) {
    await fetch(`${API_BASE}/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
  } else {
    const items = readLocalItems().map((item) =>
      Number(item.id) === Number(id) ? { ...item, status: newStatus } : item
    );
    writeLocalItems(items);
  }
  await loadItems();
  showToast(`Status changed to "${newStatus}".`);
}

async function deleteItem(id) {
  if (useBackendApi) {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  } else {
    const items = readLocalItems().filter((item) => Number(item.id) !== Number(id));
    writeLocalItems(items);
  }
  if (editIdInput.value === String(id)) {
    resetForm();
  }
  await loadItems();
  showToast(`Report #${id} deleted.`);
}

// Filter, Search & Sort Listeners
searchInput.addEventListener('input', loadItems);
typeFilter.addEventListener('change', loadItems);
statusFilter.addEventListener('change', loadItems);
sortSelect.addEventListener('change', loadItems);

resetFiltersBtn.addEventListener('click', () => {
  searchInput.value = '';
  typeFilter.value = '';
  statusFilter.value = '';
  sortSelect.value = 'newest';
  loadItems();
  showToast('Filters and sorting reset.');
});

// Startup
(async function init() {
  setTodayDate();
  await detectBackend();
  await loadItems();
})();