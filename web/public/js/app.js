const socket = io();

// ── DOM refs ────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const urlInput = $('#urlInput');
const btnStart = $('#btnStart');
const btnAbort = $('#btnAbort');
const profileSelect = $('#profileSelect');
const progressPanel = $('#progressPanel');
const progressTitle = $('#progressTitle');
const progressFill = $('#progressFill');
const routesList = $('#routesList');
const routesUl = $('#routesUl');
const scenarioResults = $('#scenarioResults');
const logOutput = $('#logOutput');
const summaryPanel = $('#summaryPanel');
const summaryGrid = $('#summaryGrid');
const summaryActions = $('#summaryActions');
const statusDot = $('#statusIndicator');
const statusText = $('#statusText');

// ── Navigation ────────────────────────────────────────
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${btn.dataset.view}`).classList.add('active');

    if (btn.dataset.view === 'history') loadHistory();
    if (btn.dataset.view === 'reports') loadReports();
    if (btn.dataset.view === 'settings') loadSettings();
    if (btn.dataset.view === 'profiles') loadProfiles();
    if (btn.dataset.view === 'run') refreshProfileSelect();
  });
});

// ── Start / Abort ────────────────────────────────────────
btnStart.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) return urlInput.focus();

  const overrides = {};
  const crawlVal = $('#overCrawl').value;
  const maxPagesVal = $('#overMaxPages').value;
  const headlessVal = $('#overHeadless').value;

  if (crawlVal) overrides.crawl = { enabled: crawlVal === 'true' };
  if (maxPagesVal) overrides.crawl = { ...(overrides.crawl || {}), maxPages: Number(maxPagesVal) };
  if (headlessVal !== '') overrides.headless = headlessVal === 'true';

  const profileId = profileSelect.value || undefined;

  resetUI();
  progressPanel.style.display = '';
  summaryPanel.style.display = 'none';
  btnStart.style.display = 'none';
  btnAbort.style.display = '';
  setStatus('running', 'Running...');

  socket.emit('startRun', {
    url,
    profileId,
    settings: Object.keys(overrides).length ? overrides : undefined
  });
});

btnAbort.addEventListener('click', () => {
  socket.emit('abort');
  btnAbort.disabled = true;
});

$('#btnClearLog').addEventListener('click', () => { logOutput.textContent = ''; });

// ── Socket events ────────────────────────────────────────
let totalPages = 0;
let processedPages = 0;

socket.on('runStart', (data) => {
  totalPages = 0;
  processedPages = 0;
  const profileInfo = data.profile ? ` (profile: ${data.profile})` : '';
  progressTitle.textContent = `Initialising...${profileInfo}`;
  progressFill.style.width = '5%';
});

socket.on('routesDiscovered', ({ routes }) => {
  totalPages = routes.length;
  routesList.style.display = '';
  routesUl.innerHTML = routes.map(r =>
    `<li title="${esc(r.url)}">${esc(r.title || r.url)}</li>`
  ).join('');
  progressTitle.textContent = `Found ${routes.length} page(s). Processing...`;
  progressFill.style.width = '10%';
});

socket.on('phase', ({ phase, message }) => {
  appendLog(`[${phase.toUpperCase()}] ${message}`);
});

socket.on('pageStart', ({ index, total, url }) => {
  progressTitle.textContent = `Page ${index + 1}/${total}: ${url}`;
  appendLog(`── Page ${index + 1}/${total}: ${url}`);
});

socket.on('pageEnd', ({ index }) => {
  processedPages = index + 1;
  const pct = totalPages > 0 ? 10 + Math.round((processedPages / totalPages) * 80) : 50;
  progressFill.style.width = `${pct}%`;
});

socket.on('scenarioStart', ({ name, stepCount }) => {
  addScenarioRow(name, 'running', stepCount);
  appendLog(`  ▸ Scenario: "${name}" (${stepCount} steps)`);
});

socket.on('scenarioEnd', ({ name, status, durationMs }) => {
  updateScenarioRow(name, status, durationMs);
  appendLog(`  ${status === 'passed' ? '✓' : '✗'} "${name}" → ${status} (${(durationMs / 1000).toFixed(2)}s)`);
});

socket.on('step', ({ scenario, stepIndex, action, outcome }) => {
  const mark = outcome === true || outcome === 'OK' ? '✓' : '✗';
  appendLog(`    ${mark} step ${stepIndex + 1}: ${action}`);
});

socket.on('log', ({ tag, message }) => {
  appendLog(`[${(tag || '').toUpperCase()}] ${message}`);
});

socket.on('crawlDone', ({ routes }) => {
  appendLog(`[CRAWL] ${routes.length} route(s) discovered`);
});

socket.on('runEnd', (data) => {
  progressFill.style.width = '100%';
  btnStart.style.display = '';
  btnAbort.style.display = 'none';
  btnAbort.disabled = false;

  if (data.error && !data.totalScenarios) {
    progressTitle.textContent = `Failed: ${data.error}`;
    setStatus('error', 'Error');
    return;
  }

  progressTitle.textContent = 'Complete!';
  setStatus('done', 'Done');

  summaryPanel.style.display = '';
  const passRate = data.totalScenarios > 0 ? Math.round((data.passed / data.totalScenarios) * 100) : 0;
  summaryGrid.innerHTML = `
    <div class="summary-item"><div class="si-label">Pages</div><div class="si-value">${data.pageCount}</div></div>
    <div class="summary-item"><div class="si-label">Scenarios</div><div class="si-value">${data.totalScenarios}</div></div>
    <div class="summary-item"><div class="si-label">Passed</div><div class="si-value green">${data.passed}</div></div>
    <div class="summary-item"><div class="si-label">Failed</div><div class="si-value red">${data.failed}</div></div>
    <div class="summary-item"><div class="si-label">Pass Rate</div><div class="si-value" style="color:${passRate >= 80 ? 'var(--green)' : passRate >= 50 ? 'var(--yellow)' : 'var(--red)'}">${passRate}%</div></div>
    <div class="summary-item"><div class="si-label">Duration</div><div class="si-value" style="font-size:1.1rem">${(data.durationMs / 1000).toFixed(1)}s</div></div>
  `;

  summaryActions.innerHTML = '';
  if (data.htmlReport) {
    const a = document.createElement('a');
    a.href = data.htmlReport;
    a.target = '_blank';
    a.className = 'btn btn-primary';
    a.textContent = 'View HTML Report';
    summaryActions.appendChild(a);
  }
  if (data.jsonReport) {
    const a = document.createElement('a');
    a.href = data.jsonReport;
    a.target = '_blank';
    a.className = 'btn btn-outline';
    a.textContent = 'View JSON Report';
    summaryActions.appendChild(a);
  }
});

socket.on('error', ({ message }) => {
  appendLog(`[ERROR] ${message}`);
  btnStart.style.display = '';
  btnAbort.style.display = 'none';
  setStatus('error', 'Error');
});

socket.on('status', ({ running }) => {
  if (running) setStatus('running', 'Running...');
});

// ── Helpers ────────────────────────────────────────
function resetUI() {
  scenarioResults.innerHTML = '';
  logOutput.textContent = '';
  routesUl.innerHTML = '';
  routesList.style.display = 'none';
  summaryPanel.style.display = 'none';
  summaryGrid.innerHTML = '';
  summaryActions.innerHTML = '';
  progressFill.style.width = '0';
}

function setStatus(state, text) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = text;
}

function appendLog(line) {
  logOutput.textContent += line + '\n';
  logOutput.scrollTop = logOutput.scrollHeight;
}

function addScenarioRow(name, status, stepCount) {
  const div = document.createElement('div');
  div.className = `scenario-result ${status}`;
  div.dataset.name = name;
  div.innerHTML = `
    <span class="sr-icon">${status === 'running' ? '&#9679;' : ''}</span>
    <span class="sr-name">${esc(name)}</span>
    <span class="sr-status pending">${stepCount} steps</span>
  `;
  scenarioResults.appendChild(div);
}

function updateScenarioRow(name, status, durationMs) {
  const row = scenarioResults.querySelector(`[data-name="${CSS.escape(name)}"]`);
  if (!row) return;
  row.className = `scenario-result ${status}`;
  const icon = status === 'passed' ? '&#10003;' : '&#10007;';
  row.querySelector('.sr-icon').innerHTML = icon;
  const statusEl = row.querySelector('.sr-status');
  statusEl.className = `sr-status ${status === 'passed' ? 'pass' : 'fail'}`;
  statusEl.textContent = `${status.toUpperCase()} (${(durationMs / 1000).toFixed(2)}s)`;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ── KV Row helpers ────────────────────────────────────────
function createKvRow(keyVal, valVal, keyPlaceholder, valPlaceholder) {
  const row = document.createElement('div');
  row.className = 'kv-row';
  row.innerHTML = `
    <input type="text" placeholder="${keyPlaceholder || 'Key'}" value="${esc(keyVal || '')}"/>
    <input type="text" placeholder="${valPlaceholder || 'Value'}" value="${esc(valVal || '')}"/>
    <button type="button" class="btn-remove-row" title="Remove">&times;</button>
  `;
  row.querySelector('.btn-remove-row').addEventListener('click', () => row.remove());
  return row;
}

function getKvData(container) {
  const data = {};
  container.querySelectorAll('.kv-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const key = inputs[0].value.trim();
    const val = inputs[1].value.trim();
    if (key) data[key] = val;
  });
  return data;
}

$$('.btn-add-row').forEach(btn => {
  btn.addEventListener('click', () => {
    const container = $(`#${btn.dataset.target}`);
    if (container) container.appendChild(createKvRow('', '', 'Field hint', 'Value'));
  });
});

// ── Page data blocks ────────────────────────────────────────
function createPageDataBlock(pathPattern, fields) {
  const block = document.createElement('div');
  block.className = 'page-data-block';

  const header = document.createElement('div');
  header.className = 'pdb-header';
  header.innerHTML = `
    <input type="text" placeholder="/path" value="${esc(pathPattern || '')}"/>
    <button type="button" class="btn-remove-row" title="Remove page">&times;</button>
  `;
  header.querySelector('.btn-remove-row').addEventListener('click', () => block.remove());
  block.appendChild(header);

  const kvContainer = document.createElement('div');
  kvContainer.className = 'pdb-fields';
  if (fields && typeof fields === 'object') {
    for (const [k, v] of Object.entries(fields)) {
      kvContainer.appendChild(createKvRow(k, v, 'Field name', 'Value'));
    }
  }
  block.appendChild(kvContainer);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-sm btn-add-row';
  addBtn.textContent = '+ Add Field';
  addBtn.addEventListener('click', () => {
    kvContainer.appendChild(createKvRow('', '', 'Field name', 'Value'));
  });
  block.appendChild(addBtn);

  return block;
}

$('#btnAddPageData').addEventListener('click', () => {
  $('#pageDataContainer').appendChild(createPageDataBlock('', {}));
});

// ── Profiles ────────────────────────────────────────
async function loadProfiles() {
  const list = $('#profilesList');
  try {
    const profiles = await fetch('/api/profiles').then(r => r.json());
    if (!profiles.length) {
      list.innerHTML = '<p class="muted">No profiles yet. Create one to provide test data for your runs.</p>';
      return;
    }
    list.innerHTML = profiles.map(p => {
      const authInfo = p.auth && p.auth.loginUrl ? `Auth: ${p.auth.loginUrl}` : 'No auth';
      const globalCount = Object.keys(p.globalData || {}).length;
      const pageCount = Object.keys(p.pageData || {}).length;
      return `
        <div class="profile-card">
          <span class="pc-name">${esc(p.name)}</span>
          <span class="pc-meta">${authInfo} · ${globalCount} global field(s) · ${pageCount} page override(s)</span>
          <div class="pc-actions">
            <button class="btn btn-sm" onclick="editProfile('${p.id}')">Edit</button>
            <button class="btn btn-sm" onclick="deleteProfileConfirm('${p.id}', '${esc(p.name)}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  } catch {
    list.innerHTML = '<p class="muted">Failed to load profiles.</p>';
  }
}

async function refreshProfileSelect() {
  try {
    const profiles = await fetch('/api/profiles').then(r => r.json());
    const current = profileSelect.value;
    profileSelect.innerHTML = '<option value="">None (AI will generate test data)</option>' +
      profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    if (current) profileSelect.value = current;
  } catch {}
}

$('#btnNewProfile').addEventListener('click', () => {
  openProfileEditor(null);
});

$('#btnCancelProfile').addEventListener('click', () => {
  $('#profileEditor').style.display = 'none';
});

$('#btnSaveProfile').addEventListener('click', async () => {
  const id = $('#peId').value;
  const profile = gatherProfileFromForm();

  if (!profile.name) {
    alert('Profile name is required');
    return;
  }

  try {
    if (id) {
      await fetch(`/api/profiles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
    } else {
      await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
    }

    const msg = $('#profileSaved');
    msg.style.display = '';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
    loadProfiles();
    refreshProfileSelect();
  } catch (err) {
    alert('Failed to save profile');
  }
});

function openProfileEditor(profile) {
  const editor = $('#profileEditor');
  editor.style.display = '';
  $('#profileEditorTitle').textContent = profile ? `Edit: ${profile.name}` : 'New Profile';
  $('#peId').value = profile ? profile.id : '';
  $('#peName').value = profile ? profile.name : '';

  const auth = profile?.auth || {};
  $('#peAuthUrl').value = auth.loginUrl || '';
  $('#peSuccessType').value = auth.successCheck?.type || '';
  $('#peSuccessValue').value = auth.successCheck?.value || '';

  const authContainer = $('#authFieldsContainer');
  authContainer.innerHTML = '';
  if (auth.fields) {
    for (const [k, v] of Object.entries(auth.fields)) {
      authContainer.appendChild(createKvRow(k, v, 'Field hint (e.g. email)', 'Value'));
    }
  }
  if (authContainer.children.length === 0) {
    authContainer.appendChild(createKvRow('', '', 'Field hint (e.g. email)', 'Value'));
  }

  const globalContainer = $('#globalDataContainer');
  globalContainer.innerHTML = '';
  if (profile?.globalData) {
    for (const [k, v] of Object.entries(profile.globalData)) {
      globalContainer.appendChild(createKvRow(k, v, 'Key', 'Value'));
    }
  }
  if (globalContainer.children.length === 0) {
    globalContainer.appendChild(createKvRow('', '', 'Key', 'Value'));
  }

  const pageContainer = $('#pageDataContainer');
  pageContainer.innerHTML = '';
  if (profile?.pageData) {
    for (const [pathPattern, fields] of Object.entries(profile.pageData)) {
      pageContainer.appendChild(createPageDataBlock(pathPattern, fields));
    }
  }

  editor.scrollIntoView({ behavior: 'smooth' });
}

function gatherProfileFromForm() {
  const authFields = getKvData($('#authFieldsContainer'));
  const successType = $('#peSuccessType').value;
  const successValue = $('#peSuccessValue').value.trim();

  const auth = {};
  const loginUrl = $('#peAuthUrl').value.trim();
  if (loginUrl) {
    auth.loginUrl = loginUrl;
    auth.fields = authFields;
    if (successType && successValue) {
      auth.successCheck = { type: successType, value: successValue };
    }
  }

  const globalData = getKvData($('#globalDataContainer'));

  const pageData = {};
  $('#pageDataContainer').querySelectorAll('.page-data-block').forEach(block => {
    const pathInput = block.querySelector('.pdb-header input');
    const pathPattern = pathInput.value.trim();
    if (!pathPattern) return;
    pageData[pathPattern] = getKvData(block.querySelector('.pdb-fields'));
  });

  return {
    name: $('#peName').value.trim(),
    auth: Object.keys(auth).length ? auth : undefined,
    globalData: Object.keys(globalData).length ? globalData : undefined,
    pageData: Object.keys(pageData).length ? pageData : undefined
  };
}

window.editProfile = async function(id) {
  try {
    const profile = await fetch(`/api/profiles/${id}`).then(r => r.json());
    openProfileEditor(profile);
  } catch {
    alert('Failed to load profile');
  }
};

window.deleteProfileConfirm = async function(id, name) {
  if (!confirm(`Delete profile "${name}"?`)) return;
  try {
    await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
    loadProfiles();
    refreshProfileSelect();
  } catch {
    alert('Failed to delete profile');
  }
};

// ── Settings ────────────────────────────────────────
async function loadSettings() {
  try {
    const [settingsRes, providersRes] = await Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/providers').then(r => r.json())
    ]);

    const providerSelect = $('#sProvider');
    providerSelect.innerHTML = providersRes.map(p =>
      `<option value="${p.name}" ${p.name === settingsRes.ai.provider ? 'selected' : ''}>${p.name} (${p.defaultModel})</option>`
    ).join('');

    $('#sTimeout').value = settingsRes.timeout;
    $('#sRetries').value = settingsRes.retries;
    $('#sHeadless').value = String(settingsRes.headless);
    $('#sTracing').value = String(settingsRes.tracing);
    $('#sModel').value = settingsRes.ai.model;
    $('#sTemp').value = settingsRes.ai.temperature;
    $('#sCrawlEnabled').value = String(settingsRes.crawl?.enabled !== false);
    $('#sCrawlMax').value = settingsRes.crawl?.maxPages || 20;
    $('#sCrawlDepth').value = settingsRes.crawl?.maxDepth || 3;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    timeout: Number($('#sTimeout').value),
    retries: Number($('#sRetries').value),
    headless: $('#sHeadless').value === 'true',
    tracing: $('#sTracing').value === 'true',
    ai: {
      provider: $('#sProvider').value,
      model: $('#sModel').value,
      temperature: Number($('#sTemp').value)
    },
    crawl: {
      enabled: $('#sCrawlEnabled').value === 'true',
      maxPages: Number($('#sCrawlMax').value),
      maxDepth: Number($('#sCrawlDepth').value)
    }
  };

  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const msg = $('#settingsSaved');
    msg.style.display = '';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  } catch (err) {
    alert('Failed to save settings');
  }
});

// ── History ────────────────────────────────────────
async function loadHistory() {
  const list = $('#historyList');
  try {
    const runs = await fetch('/api/runs').then(r => r.json());
    if (!runs.length) {
      list.innerHTML = '<p class="muted">No runs yet. Start a test run to see history.</p>';
      return;
    }
    list.innerHTML = runs.map(r => {
      const profileTag = r.profile ? ` · profile: ${esc(r.profile)}` : '';
      return `
        <div class="history-entry">
          <span class="he-url">${esc(r.baseUrl)}</span>
          <span class="he-stats">${r.pageCount} page(s) · ${r.passed}/${r.totalScenarios} passed · ${(r.durationMs / 1000).toFixed(1)}s${profileTag}</span>
          <div class="he-actions">
            ${r.htmlReport ? `<a href="${r.htmlReport}" target="_blank" class="btn btn-sm">HTML</a>` : ''}
            ${r.jsonReport ? `<a href="${r.jsonReport}" target="_blank" class="btn btn-sm">JSON</a>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch {
    list.innerHTML = '<p class="muted">Failed to load history.</p>';
  }
}

// ── Reports ────────────────────────────────────────
async function loadReports() {
  const list = $('#reportsList');
  try {
    const reports = await fetch('/api/reports').then(r => r.json());
    if (!reports.length) {
      list.innerHTML = '<p class="muted">No reports found.</p>';
      return;
    }
    list.innerHTML = reports.map(r => `
      <a href="${r.url}" target="_blank" class="report-entry" style="text-decoration:none;color:inherit">
        <span class="re-name">${esc(r.name)}</span>
        <span class="re-type">${r.type}</span>
        <span class="muted" style="font-size:0.78rem">${r.timestamp ? new Date(r.timestamp).toLocaleString() : ''}</span>
      </a>
    `).join('');
  } catch {
    list.innerHTML = '<p class="muted">Failed to load reports.</p>';
  }
}

// ── Init: load profile dropdown ────────────────────────────────────────
refreshProfileSelect();
