// ===== INIT =====
const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const BACKEND_URL = window.BACKEND_URL;

let currentUser = null;
let selectedProjectId = null;
let isEditing = false;

// ============================
//  AUTH SCREEN SWITCHING
// ============================
window.showSignupView = function() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('signup-view').classList.remove('hidden');
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('signup-error').classList.add('hidden');
};

window.showLoginView = function() {
  document.getElementById('signup-view').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('signup-error').classList.add('hidden');
  document.getElementById('login-error').classList.add('hidden');
};

window.signIn = async function() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    document.getElementById('login-error').textContent = error.message;
    document.getElementById('login-error').classList.remove('hidden');
    return;
  }
  currentUser = data.user;
  onAuthSuccess();
};

window.signUp = async function() {
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    document.getElementById('signup-error').textContent = error.message;
    document.getElementById('signup-error').classList.remove('hidden');
    return;
  }
  alert('Account created! You can now log in.');
  showLoginView();
};

function onAuthSuccess() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  updateProfileUI();
  loadProjects();
}

window.logout = async function() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  document.getElementById('auth-container').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
  hideCreateProject();
  document.getElementById('query-section').classList.add('hidden');
};

// ============================
//  PROFILE
// ============================
function updateProfileUI() {
  const user = currentUser;
  if (!user) return;
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-initial').textContent = name.charAt(0).toUpperCase();
  document.getElementById('menu-user-name').textContent = name;
  document.getElementById('menu-user-email').textContent = user.email;
}

window.toggleProfileMenu = function() {
  document.getElementById('profile-menu').classList.toggle('hidden');
};

document.addEventListener('click', function(e) {
  const menu = document.getElementById('profile-menu');
  if (!menu.classList.contains('hidden') && !e.target.closest('#profile-menu') && !e.target.closest('button[onclick="toggleProfileMenu()"]')) {
    menu.classList.add('hidden');
  }
});

window.editProfileName = async function() {
  const currentName = document.getElementById('profile-name').textContent;
  const newName = prompt('Enter new display name:', currentName);
  if (newName && newName !== currentName) {
    const { error } = await supabaseClient.auth.updateUser({ data: { full_name: newName } });
    if (error) return alert('Error updating name');
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    updateProfileUI();
    document.getElementById('profile-menu').classList.add('hidden');
  }
};

// ============================
//  API HELPER
// ============================
async function api(path, method = 'GET', body = null) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ============================
//  PROJECTS
// ============================
async function loadProjects() {
  try {
    const projects = await api('/projects');
    const select = document.getElementById('project-select');
    select.innerHTML = '<option value="">-- Select a project --</option>';
    projects.forEach(p => {
      select.innerHTML += `<option value="${p.id}">${p.name} (${p.db_type})</option>`;
    });
  } catch (err) {
    console.error('Failed to load projects', err);
  }
}

window.showCreateProject = function() {
  isEditing = false;
  document.getElementById('form-title').textContent = 'New Project';
  document.getElementById('form-submit-btn').textContent = 'Create Project';
  document.getElementById('form-submit-btn').onclick = createProject;
  document.getElementById('project-name').value = '';
  document.getElementById('project-db-type').value = 'mysql';
  document.getElementById('tables-container').innerHTML = '';
  addTable();
  document.getElementById('create-project-form').classList.remove('hidden');
};

window.hideCreateProject = function() {
  document.getElementById('create-project-form').classList.add('hidden');
  isEditing = false;
  document.getElementById('form-submit-btn').onclick = createProject;
};

function collectSchemaFromForm() {
  const tables = [];
  document.querySelectorAll('#tables-container > div').forEach(tableDiv => {
    const tableName = tableDiv.querySelector('.table-name').value;
    if (!tableName) return;
    const columns = [];
    tableDiv.querySelectorAll('.columns-container > div').forEach(colDiv => {
      const colName = colDiv.querySelector('.col-name').value;
      const colType = colDiv.querySelector('.col-type').value;
      const colFk = colDiv.querySelector('.col-fk').value;
      const constraints = colDiv.querySelector('.col-constraints')?.value || '';
      if (colName && colType) {
        const col = { name: colName, type: colType.toUpperCase() };
        if (colFk) col.fk = colFk;
        if (constraints.trim()) col.constraints = constraints.trim();
        columns.push(col);
      }
    });
    if (columns.length > 0) {
      tables.push({ name: tableName, columns, estimated_rows: 100 });
    }
  });
  return tables;
}

window.createProject = async function() {
  const name = document.getElementById('project-name').value;
  const db_type = document.getElementById('project-db-type').value;
  if (!name) return alert('Project name required');
  const tables = collectSchemaFromForm();
  if (tables.length === 0) return alert('Add at least one table with columns');
  const schema = { db_type, tables };
  try {
    await api('/projects', 'POST', { name, db_type, schema_json: schema });
    hideCreateProject();
    loadProjects();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

window.editSelectedProject = async function() {
  if (!selectedProjectId) return;
  try {
    const project = await api(`/projects/${selectedProjectId}`);
    isEditing = true;
    document.getElementById('form-title').textContent = 'Edit Project';
    document.getElementById('form-submit-btn').textContent = 'Update Project';
    document.getElementById('form-submit-btn').onclick = updateProject;
    document.getElementById('project-name').value = project.name;
    document.getElementById('project-db-type').value = project.db_type;
    const container = document.getElementById('tables-container');
    container.innerHTML = '';
    project.schema_json.tables.forEach(table => {
      addTable();
      const tableDiv = container.lastElementChild;
      tableDiv.querySelector('.table-name').value = table.name;
      table.columns.forEach(col => {
        addColumn(tableDiv.querySelector('.columns-container'));
        const colDiv = tableDiv.querySelector('.columns-container').lastElementChild;
        colDiv.querySelector('.col-name').value = col.name;
        colDiv.querySelector('.col-type').value = col.type;
        colDiv.querySelector('.col-fk').value = col.fk || '';
        colDiv.querySelector('.col-constraints').value = col.constraints || '';
      });
    });
    document.getElementById('create-project-form').classList.remove('hidden');
  } catch (err) {
    alert('Error loading project: ' + err.message);
  }
};

window.updateProject = async function() {
  const name = document.getElementById('project-name').value;
  const db_type = document.getElementById('project-db-type').value;
  const tables = collectSchemaFromForm();
  if (!name || tables.length === 0) return alert('Invalid project data');
  const schema = { db_type, tables };
  try {
    await api(`/projects/${selectedProjectId}`, 'PUT', { name, db_type, schema_json: schema });
    hideCreateProject();
    loadProjects();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

window.selectProject = function() {
  selectedProjectId = document.getElementById('project-select').value;
  document.getElementById('edit-project-btn').disabled = !selectedProjectId;
  document.getElementById('dummy-manager-btn').disabled = !selectedProjectId;
  document.getElementById('delete-project-btn').disabled = !selectedProjectId;
  document.getElementById('copy-project-btn').disabled = !selectedProjectId;
  const querySection = document.getElementById('query-section');
  if (selectedProjectId) {
    querySection.classList.remove('hidden');
    document.getElementById('generated-queries').innerHTML = '';
    document.getElementById('execution-results').classList.add('hidden');
  } else {
    querySection.classList.add('hidden');
  }
};

// ============================
//  DELETE PROJECT
// ============================
window.deleteSelectedProject = async function() {
  if (!selectedProjectId) return;
  if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
  try {
    await api(`/projects/${selectedProjectId}`, 'DELETE');
    selectedProjectId = null;
    document.getElementById('project-select').value = '';
    document.getElementById('query-section').classList.add('hidden');
    document.getElementById('edit-project-btn').disabled = true;
    document.getElementById('dummy-manager-btn').disabled = true;
    document.getElementById('delete-project-btn').disabled = true;
    document.getElementById('copy-project-btn').disabled = true;
    loadProjects();
    alert('Project deleted.');
  } catch (err) {
    alert('Error deleting project: ' + err.message);
  }
};

// ============================
//  COPY PROJECT
// ============================
window.showCopyDialog = async function() {
  if (!selectedProjectId) return;
  // Pre‑fill the input with a default name: "OriginalName (copy)"
  const select = document.getElementById('project-select');
  const selectedText = select.options[select.selectedIndex]?.text || '';
  const originalName = selectedText.split(' (')[0] || 'Project';
  document.getElementById('copy-project-name').value = originalName + ' (copy)';
  document.getElementById('copy-dialog').classList.remove('hidden');
};

window.closeCopyDialog = function() {
  document.getElementById('copy-dialog').classList.add('hidden');
};

window.copyProject = async function(mode) {
  if (!selectedProjectId) return;
  const newName = document.getElementById('copy-project-name').value.trim();
  if (!newName) return alert('Please enter a name for the copied project.');
  closeCopyDialog();
  try {
    await api(`/projects/${selectedProjectId}/copy`, 'POST', { mode, name: newName });
    await loadProjects();
    alert('Project copied successfully.');
  } catch (err) {
    alert('Error copying project: ' + err.message);
  }
};

// ============================
//  TABLE/COLUMN HELPERS
// ============================
window.addTable = function() {
  const container = document.getElementById('tables-container');
  const div = document.createElement('div');
  div.className = 'border p-3 rounded mb-2';
  div.innerHTML = `
    <input type="text" placeholder="Table name" class="table-name w-full p-1 border rounded mb-2">
    <div class="columns-container space-y-1"></div>
    <button onclick="addColumn(this)" class="text-sm text-blue-600">+ Add Column</button>
    <button onclick="removeTable(this)" class="text-sm text-red-600 ml-2">Remove Table</button>
  `;
  container.appendChild(div);
  addColumn(div.querySelector('.columns-container'));
};

window.addColumn = function(btn) {
  const container = btn.tagName === 'DIV' ? btn : btn.parentElement.querySelector('.columns-container');
  const div = document.createElement('div');
  div.className = 'flex gap-2 items-center flex-wrap';
  div.innerHTML = `
    <input type="text" placeholder="Column name" class="col-name flex-1 min-w-[100px] p-1 border rounded">
    <input type="text" placeholder="Type (e.g., INTEGER)" class="col-type w-28 p-1 border rounded">
    <input type="text" placeholder="FK (table.col)" class="col-fk w-28 p-1 border rounded">
    <input type="text" placeholder="Constraints (e.g., PRIMARY KEY)" class="col-constraints w-40 p-1 border rounded">
    <button onclick="this.parentElement.remove()" class="text-red-500">×</button>
  `;
  container.appendChild(div);
};

window.removeTable = function(btn) {
  btn.parentElement.remove();
};

// ============================
//  QUERY GENERATION & EXECUTION
// ============================
window.generateQueries = async function() {
  if (!selectedProjectId) return;
  const prompt = document.getElementById('user-prompt').value;
  if (!prompt) return;

  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  document.getElementById('gen-spinner').classList.remove('hidden');

  try {
    const data = await api(`/projects/${selectedProjectId}/generate`, 'POST', { prompt });
    displayQueries(data.queries);
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    document.getElementById('gen-spinner').classList.add('hidden');
  }
};

function displayQueries(queries) {
  const container = document.getElementById('generated-queries');
  container.innerHTML = '';
  if (!queries.length) {
    container.innerHTML = '<p class="text-gray-500">No queries generated.</p>';
    return;
  }



  queries.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'card bg-white p-4 rounded-lg shadow-md';
    
    // For the first option, add a "Recommended" badge
    const badge = idx === 0 
      ? `<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-semibold">⭐ Recommended</span>` 
      : '';
    
    card.innerHTML = `
      <div class="flex justify-between items-start">
        <h3 class="font-semibold text-lg">Option ${idx + 1} ${badge}</h3>
        <span class="text-sm bg-gray-200 px-2 py-1 rounded">${q.impact?.type || 'SELECT'}</span>
      </div>
      <pre class="bg-gray-100 p-2 rounded my-2 text-sm overflow-x-auto">${escapeHtml(q.sql)}</pre>
      <p class="text-gray-700"><strong>Explanation:</strong> ${q.explanation}</p>
      <p class="text-sm text-gray-600">Tables: ${(q.tables || []).join(', ') || 'N/A'}</p>
      <p class="text-sm text-gray-600">Columns: ${(q.attributes || []).join(', ') || 'N/A'}</p>
      
      ${q.warnings?.length ? `<p class="text-orange-600 text-sm">⚠️ ${q.warnings.join('; ')}</p>` : ''}
      ${q.optimizations?.length ? `<p class="text-blue-600 text-sm">💡 ${q.optimizations.join('; ')}</p>` : ''}
      <button onclick="window.executeQuery(\`${escapeSql(q.sql)}\`)" class="mt-2 bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-sm">Execute</button>
    `;
    container.appendChild(card);
  });
}

window.executeQuery = async function(sql) {
  if (!selectedProjectId) return;
  try {
    const result = await api(`/projects/${selectedProjectId}/execute`, 'POST', { sql });
    const container = document.getElementById('execution-results');
    container.classList.remove('hidden');
    const tableDiv = document.getElementById('result-table');
    if (result.rows.length === 0) {
      tableDiv.innerHTML = '<p class="text-gray-500">No rows returned.</p>';
      return;
    }
    let html = '<table class="min-w-full border"><thead><tr>';
    result.columns.forEach(col => html += `<th class="border p-2 bg-gray-100">${col}</th>`);
    html += '</tr></thead><tbody>';
    result.rows.forEach(row => {
      html += '<tr>';
      row.forEach(val => html += `<td class="border p-2">${val}</td>`);
      html += '</tr>';
    });
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
  } catch (err) {
    alert('Execution error: ' + err.message);
  }
};

// ============================
//  DUMMY DATA MANAGER
// ============================

let currentDummyData = {};
let currentSchemaTables = [];   
window.showDummyManager = async function() {
  if (!selectedProjectId) return;
  try {
    const project = await api(`/projects/${selectedProjectId}`);
    currentDummyData = project.dummy_data || {};
    // Store table names from the schema for CSV upload
    currentSchemaTables = (project.schema_json && project.schema_json.tables)
      ? project.schema_json.tables.map(t => t.name)
      : [];
    renderDummyTables();
    document.getElementById('dummy-manager').classList.remove('hidden');
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

window.closeDummyManager = function() {
  document.getElementById('dummy-manager').classList.add('hidden');
};

function renderDummyTables() {
  const container = document.getElementById('dummy-tables-container');
  container.innerHTML = '';
  if (Object.keys(currentDummyData).length === 0) {
    container.innerHTML = '<p class="text-gray-500">No dummy data available.</p>';
    return;
  }
  for (const [tableName, rows] of Object.entries(currentDummyData)) {
    if (!rows.length) continue;
    const tableDiv = document.createElement('div');
    tableDiv.className = 'mb-6';
    tableDiv.innerHTML = `<h3 class="font-semibold text-lg mb-2">${tableName} (${rows.length} rows)</h3>`;
    const table = document.createElement('table');
    table.className = 'min-w-full border mb-2';
    const columns = Object.keys(rows[0]);
    table.innerHTML = `
      <thead>
        <tr>
          ${columns.map(c => `<th class="border p-2 bg-gray-100">${c}</th>`).join('')}
          <th class="border p-2 bg-gray-100">Actions</th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement('tbody');
    rows.forEach((row, idx) => {
      const tr = document.createElement('tr');
      columns.forEach(col => {
        tr.innerHTML += `<td class="border p-1"><input type="text" value="${row[col] ?? ''}" data-table="${tableName}" data-row="${idx}" data-col="${col}" class="w-full p-1 border rounded dummy-cell"></td>`;
      });
      tr.innerHTML += `<td class="border p-1 text-center"><button onclick="deleteDummyRow('${tableName}', ${idx})" class="text-red-600 text-sm">Delete</button></td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableDiv.appendChild(table);
    tableDiv.innerHTML += `<button onclick="addDummyRow('${tableName}')" class="text-blue-600 text-sm">+ Add Row</button>`;
    container.appendChild(tableDiv);
  }
}

window.deleteDummyRow = function(tableName, idx) {
  if (confirm('Delete this row?')) {
    currentDummyData[tableName].splice(idx, 1);
    renderDummyTables();
  }
};

window.addDummyRow = function(tableName) {
  if (!currentDummyData[tableName] || !currentDummyData[tableName].length) return;
  const sample = currentDummyData[tableName][0];
  const newRow = {};
  Object.keys(sample).forEach(col => newRow[col] = null);
  currentDummyData[tableName].push(newRow);
  renderDummyTables();
};

window.saveDummyData = async function() {
  document.querySelectorAll('.dummy-cell').forEach(input => {
    const table = input.dataset.table;
    const row = parseInt(input.dataset.row);
    const col = input.dataset.col;
    currentDummyData[table][row][col] = isNaN(input.value) ? input.value : Number(input.value) || input.value;
  });
  try {
    await api(`/projects/${selectedProjectId}/dummy`, 'PUT', { dummy_data: currentDummyData });
    alert('Dummy data updated!');
    closeDummyManager();
  } catch (err) {
    alert('Error saving dummy data: ' + err.message);
  }
};

window.handleCSVUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const csv = e.target.result;
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return alert('CSV must have header and data');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const obj = {};
      headers.forEach((h, i) => obj[h] = vals[i] || null);
      return obj;
    });

    // Use the schema tables list, not dummy data keys
    const tables = currentSchemaTables;
    if (tables.length === 0) return alert('No tables defined in this project. Please add tables first.');

    const tableName = prompt('Which table does this CSV belong to?', tables[0]);
    if (tableName && tables.includes(tableName)) {
      // Assign rows to the chosen table (creates it in currentDummyData if missing)
      currentDummyData[tableName] = rows;
      renderDummyTables();
    } else {
      alert('Table not found');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
};

// ============================
//  UTILS
// ============================
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeSql(sql) {
  return sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

// ============================
//  INIT – session check
// ============================
window.addEventListener('load', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    onAuthSuccess();
  }
});