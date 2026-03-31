/* ══════════════════════════════════════════════════════
   TDS Intelligence Platform — Dashboard JS
   ══════════════════════════════════════════════════════ */
'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const COLUMNS = [
  'Resin Grade Name','Resin Type','Chemical Name','Manufacturer',
  'Manufacturer Website','Manufacturer Country Origin','Chemical Formula',
  'CAS Number','EINECS Number','Grade','Applications','TDS Link'
];

const PAGE_SIZE = 25;
let currentPage = 1;
let allData = [];
let filteredData = [];
let fileQueue = [];
let isProcessing = false;
let sortCol = null;
let sortDir = 1;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadSettings();
  loadData();
  renderAll();
  updateAPIStatus();
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function checkAuth() {
  const s = JSON.parse(localStorage.getItem('tds_session') || sessionStorage.getItem('tds_session') || 'null');
  if (!s || (Date.now() - s.ts > 86400000 * 7)) { window.location.href = 'login.html'; return; }
  document.getElementById('user-name').textContent = s.username;
  document.getElementById('user-role').textContent = s.role === 'admin' ? 'Administrator' : 'Viewer';
}

function logout() {
  localStorage.removeItem('tds_session');
  sessionStorage.removeItem('tds_session');
  window.location.href = 'login.html';
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function loadSettings() {
  document.getElementById('anthropic-key').value  = ((window.TDS_CONFIG && window.TDS_CONFIG.anthropic_key) ? window.TDS_CONFIG.anthropic_key : localStorage.getItem('tds_anthropic_key'))  || '';
  document.getElementById('perplexity-key').value = ((window.TDS_CONFIG && window.TDS_CONFIG.perplexity_key) ? window.TDS_CONFIG.perplexity_key : localStorage.getItem('tds_perplexity_key')) || '';
  document.getElementById('claude-model').value   = localStorage.getItem('tds_claude_model')   || 'claude-opus-4-20250514';
  document.getElementById('pplx-model').value     = localStorage.getItem('tds_pplx_model')     || 'sonar-pro';
}

function saveSettings() {
  const ak = document.getElementById('anthropic-key').value.trim();
  const pk = document.getElementById('perplexity-key').value.trim();
  const cm = document.getElementById('claude-model').value;
  const pm = document.getElementById('pplx-model').value;
  if (ak) localStorage.setItem('tds_anthropic_key', ak);
  if (pk) localStorage.setItem('tds_perplexity_key', pk);
  localStorage.setItem('tds_claude_model', cm);
  localStorage.setItem('tds_pplx_model', pm);
  updateAPIStatus();
  toast('Settings saved!', 'success');
}

function toggleField(id, btn) {
  const inp = document.getElementById(id);
  if (inp.type === 'password') { inp.type = 'text'; btn.innerHTML = '<i class="bi bi-eye-slash-fill"></i>'; }
  else { inp.type = 'password'; btn.innerHTML = '<i class="bi bi-eye-fill"></i>'; }
}

async function testAPIs() {
  const ak = ((window.TDS_CONFIG && window.TDS_CONFIG.anthropic_key) ? window.TDS_CONFIG.anthropic_key : localStorage.getItem('tds_anthropic_key'));
  const pk = ((window.TDS_CONFIG && window.TDS_CONFIG.perplexity_key) ? window.TDS_CONFIG.perplexity_key : localStorage.getItem('tds_perplexity_key'));
  if (!ak && !pk) { toast('No API keys configured', 'error'); return; }
  toast('Testing connections...', 'info');
  if (ak) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': ak, 'anthropic-version': '2023-06-01' } });
      if (r.ok) toast('Anthropic API: Connected', 'success');
      else toast('Anthropic API: Invalid key', 'error');
    } catch(e) { toast('Anthropic API: Network error', 'error'); }
  }
}

function updateAPIStatus() {
  const ak = ((window.TDS_CONFIG && window.TDS_CONFIG.anthropic_key) ? window.TDS_CONFIG.anthropic_key : localStorage.getItem('tds_anthropic_key'));
  const pk = ((window.TDS_CONFIG && window.TDS_CONFIG.perplexity_key) ? window.TDS_CONFIG.perplexity_key : localStorage.getItem('tds_perplexity_key'));
  const antDot = document.getElementById('ant-status-dot');
  const pplxDot = document.getElementById('pplx-status-dot');
  if (antDot) { antDot.className = 'api-dot ' + (ak ? 'ok' : 'missing'); }
  if (pplxDot) { pplxDot.className = 'api-dot ' + (pk ? 'ok' : 'missing'); }
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
function loadData() {
  try { allData = JSON.parse(localStorage.getItem('tds_data') || '[]'); } catch(e) { allData = []; }
  filteredData = [...allData];
}
function saveData() {
  localStorage.setItem('tds_data', JSON.stringify(allData));
  renderAll();
}
function clearAllData() {
  if (!confirm('Delete ALL extracted records? This cannot be undone.')) return;
  allData = []; filteredData = [];
  saveData();
  toast('All data cleared', 'info');
}

// ─── NAV / PANELS ─────────────────────────────────────────────────────────────
function switchPanel(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  if (el) el.classList.add('active');
  const labels = { overview:'Overview', upload:'Upload TDS', search:'Search Resins', records:'All Records', export:'Export Data', settings:'API Settings' };
  document.getElementById('breadcrumb-current').textContent = labels[name] || name;
  if (name === 'records') { filterTable(); }
  if (name === 'overview') { renderOverview(); }
  if (name === 'export') { updateExportStats(); }
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth <= 768) { sb.classList.toggle('mobile-open'); }
  else { sb.classList.toggle('collapsed'); document.body.classList.toggle('sidebar-collapsed'); }
}

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function renderAll() {
  updateTopbar();
  renderOverview();
  updateExportStats();
  filterTable();
  updateNavCount();
}

function updateTopbar() {
  document.getElementById('topbar-records').textContent = allData.length;
}
function updateNavCount() {
  document.getElementById('nav-count').textContent = allData.length;
  document.getElementById('records-subtitle').textContent = `${filteredData.length} entries`;
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
function renderOverview() {
  const total = allData.length;
  const withLinks = allData.filter(r => r['TDS Link']).length;
  const withCas = allData.filter(r => r['CAS Number']).length;
  const mfrs = new Set(allData.map(r => r['Manufacturer']).filter(Boolean)).size;

  document.getElementById('kpi-total').textContent = total;
  document.getElementById('kpi-links').textContent = withLinks;
  document.getElementById('kpi-cas').textContent = withCas;
  document.getElementById('kpi-mfr').textContent = mfrs;
  document.getElementById('kpi-total-trend').textContent = total > 0 ? `${total} records loaded` : 'Awaiting data';
  document.getElementById('kpi-link-pct').textContent = total > 0 ? `${Math.round(withLinks/total*100)}% verified` : '0% verified';
  document.getElementById('kpi-cas-pct').textContent = total > 0 ? `${Math.round(withCas/total*100)}% identified` : '0% identified';

  // Recent list
  const recentEl = document.getElementById('recent-list');
  const recent = [...allData].reverse().slice(0, 8);
  if (recent.length === 0) {
    recentEl.innerHTML = `<div class="empty-state-sm"><i class="bi bi-inbox"></i><span>No records yet</span></div>`;
  } else {
    recentEl.innerHTML = recent.map((r, i) => `
      <div class="recent-item" onclick="openModal(${allData.indexOf(r)})">
        <div class="recent-item-dot" style="background:${['#0ea5e9','#14b8a6','#f59e0b','#8b5cf6'][i%4]}"></div>
        <div class="recent-item-name">${r['Resin Grade Name'] || 'Unnamed'}</div>
        <div class="recent-item-type">${r['Resin Type'] || '—'}</div>
      </div>
    `).join('');
  }

  // Type chart
  const typeMap = {};
  allData.forEach(r => {
    const t = (r['Resin Type'] || 'Unknown').split('(')[0].trim().slice(0,30);
    typeMap[t] = (typeMap[t] || 0) + 1;
  });
  const sorted = Object.entries(typeMap).sort((a,b) => b[1]-a[1]).slice(0,8);
  const maxVal = sorted[0]?.[1] || 1;
  const chartEl = document.getElementById('type-chart');
  if (sorted.length === 0) {
    chartEl.innerHTML = `<div class="empty-state-sm"><i class="bi bi-bar-chart"></i><span>No data to chart</span></div>`;
  } else {
    chartEl.innerHTML = sorted.map(([type, count]) => `
      <div class="chart-row">
        <div class="chart-label" title="${type}">${type}</div>
        <div class="chart-bar-wrap"><div class="chart-bar" style="width:${Math.round(count/maxVal*100)}%"></div></div>
        <div class="chart-count">${count}</div>
      </div>
    `).join('');
  }
}

// ─── UPLOAD / FILE QUEUE ──────────────────────────────────────────────────────
function onDragOver(e) { e.preventDefault(); document.getElementById('drop-zone').classList.add('dragging'); }
function onDragLeave(e) { document.getElementById('drop-zone').classList.remove('dragging'); }
function onDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('dragging');
  addFiles([...e.dataTransfer.files]);
}
function addFiles(files) {
  const pdfs = files.filter(f => f.type === 'application/pdf');
  pdfs.forEach(f => { if (!fileQueue.find(q => q.name === f.name)) fileQueue.push({ file: f, name: f.name, status: 'pending' }); });
  renderQueue();
}
function renderQueue() {
  const wrap = document.getElementById('upload-queue');
  if (fileQueue.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  document.getElementById('queue-count').textContent = fileQueue.length;
  document.getElementById('nav-queue-badge').style.display = fileQueue.filter(q=>q.status==='pending').length ? '' : 'none';
  document.getElementById('nav-queue-badge').textContent = fileQueue.filter(q=>q.status==='pending').length;
  document.getElementById('queue-list').innerHTML = fileQueue.map((item, i) => {
    const icons = { pending: 'bi bi-file-earmark-pdf text-secondary', processing: 'bi bi-arrow-repeat spin text-warning', done: 'bi bi-check-circle-fill text-success', error: 'bi bi-x-circle-fill text-danger' };
    const labels = { pending: 'Ready', processing: 'Processing...', done: 'Extracted', error: 'Failed' };
    return `
      <div class="queue-item ${item.status}" id="qi-${i}">
        <i class="qi-icon ${icons[item.status]}"></i>
        <span class="qi-name">${item.name}</span>
        <span class="qi-status">${labels[item.status]}</span>
        ${item.status === 'pending' ? `<button class="qi-remove" onclick="removeFromQueue(${i})"><i class="bi bi-x"></i></button>` : ''}
      </div>`;
  }).join('');
}
function removeFromQueue(i) { fileQueue.splice(i, 1); renderQueue(); }
function clearQueue() { fileQueue = []; renderQueue(); }

// ─── PDF → BASE64 ─────────────────────────────────────────────────────────────
function pdfToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─── LOG ─────────────────────────────────────────────────────────────────────
function logMsg(msg, type = 'info', elId = 'upload-log') {
  const el = document.getElementById(elId);
  el.style.display = 'block';
  const d = document.createElement('div');
  d.className = `log-entry ${type}`;
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

// ─── CLAUDE API ───────────────────────────────────────────────────────────────
async function callClaude(messagesArr, apiKey, model) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: model || 'claude-opus-4-20250514', max_tokens: 1500, messages: messagesArr })
  });
  if (!resp.ok) { const e = await resp.text(); throw new Error(`Claude ${resp.status}: ${e.slice(0,200)}`); }
  const data = await resp.json();
  return data.content?.[0]?.text || '';
}

async function extractFromPDF(base64Data, filename, apiKey, model) {
  const prompt = `You are a chemical data extraction expert. Extract ALL data from this Technical Data Sheet PDF.
Return ONLY a valid JSON object with these exact 12 fields (use null if not found, never leave undefined):
{
  "Resin Grade Name": "exact product grade name from document",
  "Resin Type": "polymer type (e.g. polyether polyol, epoxy, PBT, POM, PET, PC)",
  "Chemical Name": "full IUPAC or chemical name",
  "Manufacturer": "company name",
  "Manufacturer Website": "company URL",
  "Manufacturer Country Origin": "country",
  "Chemical Formula": "molecular formula if available",
  "CAS Number": "CAS registry number with dashes",
  "EINECS Number": "EINECS/EC number if available",
  "Grade": "grade designation if mentioned",
  "Applications": "key applications comma-separated",
  "TDS Link": null
}
Return ONLY the JSON object. No markdown. No preamble. File: ${filename}`;

  const text = await callClaude([{
    role: 'user',
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
      { type: 'text', text: prompt }
    ]
  }], apiKey, model);

  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ─── PROCESS ALL PDFs ─────────────────────────────────────────────────────────
async function processAllPDFs() {
  if (isProcessing) return;
  const apiKey = ((window.TDS_CONFIG && window.TDS_CONFIG.anthropic_key) ? window.TDS_CONFIG.anthropic_key : localStorage.getItem('tds_anthropic_key'));
  if (!apiKey) { toast('Please configure your Anthropic API key in Settings', 'error'); switchPanel('settings', document.querySelector('[data-panel=settings]')); return; }

  const pending = fileQueue.filter(q => q.status === 'pending');
  if (!pending.length) { toast('No files pending in queue', 'warn'); return; }

  isProcessing = true;
  document.getElementById('process-btn').disabled = true;
  document.getElementById('process-icon').className = 'bi bi-arrow-repeat spin';
  document.getElementById('process-text').textContent = 'Processing...';
  document.getElementById('upload-progress').style.display = 'block';
  document.getElementById('upload-log').innerHTML = '';
  document.getElementById('upload-log').style.display = 'block';

  const model = localStorage.getItem('tds_claude_model') || 'claude-opus-4-20250514';
  let done = 0, failed = 0;

  for (let i = 0; i < fileQueue.length; i++) {
    const item = fileQueue[i];
    if (item.status !== 'pending') continue;
    item.status = 'processing';
    renderQueue();
    logMsg(`Processing [${i+1}/${fileQueue.length}]: ${item.name}`, 'info');
    try {
      const b64 = await pdfToBase64(item.file);
      const extracted = await extractFromPDF(b64, item.name, apiKey, model);
      extracted['_source'] = item.name;
      extracted['_ts'] = Date.now();
      allData.push(extracted);
      saveData();
      item.status = 'done';
      done++;
      logMsg(`Extracted: ${extracted['Resin Grade Name'] || item.name} [${extracted['Manufacturer'] || 'unknown mfr'}]`, 'success');
    } catch(e) {
      item.status = 'error';
      failed++;
      logMsg(`Failed: ${item.name} — ${e.message}`, 'error');
    }
    renderQueue();
    const prog = Math.round(((i + 1) / fileQueue.length) * 100);
    document.getElementById('progress-fill').style.width = prog + '%';
    document.getElementById('progress-pct').textContent = prog + '%';
    document.getElementById('progress-label').textContent = `${i+1} / ${fileQueue.length} files`;
  }

  isProcessing = false;
  document.getElementById('process-btn').disabled = false;
  document.getElementById('process-icon').className = 'bi bi-play-fill';
  document.getElementById('process-text').textContent = 'Extract All';
  document.getElementById('progress-label').textContent = `Done — ${done} extracted, ${failed} failed`;
  logMsg(`Complete! ${done} extracted, ${failed} failed.`, done > 0 ? 'success' : 'error');
  updateNavCount();
  if (done > 0) { toast(`${done} records extracted successfully`, 'success'); setTimeout(() => switchPanel('records', document.querySelector('[data-panel=records]')), 1600); }
  else toast(`Extraction failed. Check log for details.`, 'error');
}

// ─── PERPLEXITY SEARCH ────────────────────────────────────────────────────────
async function searchResinPerplexity(name, pplxKey, model) {
  const resp = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pplxKey}` },
    body: JSON.stringify({
      model: model || 'sonar-pro',
      messages: [{
        role: 'system',
        content: 'You are a chemical TDS data expert. Always return ONLY valid JSON, no other text, no markdown.'
      }, {
        role: 'user',
        content: `Find the Technical Data Sheet for resin grade "${name}". Extract and return ONLY this JSON object:
{
  "Resin Grade Name": "${name}",
  "Resin Type": "polymer type",
  "Chemical Name": "full chemical name",
  "Manufacturer": "company name",
  "Manufacturer Website": "website URL",
  "Manufacturer Country Origin": "country",
  "Chemical Formula": "molecular formula or null",
  "CAS Number": "CAS number with dashes or null",
  "EINECS Number": "EINECS number or null",
  "Grade": "grade info or null",
  "Applications": "applications comma-separated",
  "TDS Link": "direct URL to TDS PDF if found or null"
}
Return ONLY valid JSON.`
      }],
      max_tokens: 1200
    })
  });
  if (!resp.ok) { const e = await resp.text(); throw new Error(`Perplexity ${resp.status}: ${e.slice(0,200)}`); }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

async function searchWithClaudeFallback(name, apiKey, model) {
  const text = await callClaude([{
    role: 'user',
    content: `Based on your knowledge, return technical data for resin grade "${name}". Return ONLY this JSON:
{
  "Resin Grade Name": "${name}",
  "Resin Type": "...",
  "Chemical Name": "...",
  "Manufacturer": "...",
  "Manufacturer Website": "...",
  "Manufacturer Country Origin": "...",
  "Chemical Formula": "...",
  "CAS Number": "...",
  "EINECS Number": "...",
  "Grade": "...",
  "Applications": "...",
  "TDS Link": null
}
Return ONLY JSON.`
  }], apiKey, model);
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ─── SEARCH RESINS ────────────────────────────────────────────────────────────
async function searchResins() {
  const pplxKey = ((window.TDS_CONFIG && window.TDS_CONFIG.perplexity_key) ? window.TDS_CONFIG.perplexity_key : localStorage.getItem('tds_perplexity_key'));
  const apiKey  = ((window.TDS_CONFIG && window.TDS_CONFIG.anthropic_key) ? window.TDS_CONFIG.anthropic_key : localStorage.getItem('tds_anthropic_key'));
  if (!pplxKey && !apiKey) { toast('Please configure API keys in Settings', 'error'); return; }

  const names = document.getElementById('resin-names-input').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!names.length) { toast('Enter at least one resin name', 'warn'); return; }

  document.getElementById('search-btn').disabled = true;
  document.getElementById('search-icon').className = 'bi bi-arrow-repeat spin';
  document.getElementById('search-text').textContent = 'Searching...';
  document.getElementById('search-progress').style.display = 'block';
  document.getElementById('search-log').innerHTML = '';
  document.getElementById('search-log').style.display = 'block';

  const pplxModel = localStorage.getItem('tds_pplx_model') || 'sonar-pro';
  const claudeModel = localStorage.getItem('tds_claude_model') || 'claude-opus-4-20250514';
  let done = 0, failed = 0;

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const prog = Math.round(((i + 1) / names.length) * 100);
    document.getElementById('search-progress-fill').style.width = prog + '%';
    document.getElementById('search-progress-pct').textContent = prog + '%';
    document.getElementById('search-progress-label').textContent = `Searching [${i+1}/${names.length}]: ${name}`;
    logMsg(`Searching: ${name}`, 'info', 'search-log');

    try {
      let extracted;
      if (pplxKey) {
        extracted = await searchResinPerplexity(name, pplxKey, pplxModel);
      } else {
        extracted = await searchWithClaudeFallback(name, apiKey, claudeModel);
      }
      if (!extracted['Resin Grade Name']) extracted['Resin Grade Name'] = name;
      extracted['_ts'] = Date.now();
      allData.push(extracted);
      saveData();
      done++;
      logMsg(`Found: ${name} — ${extracted['Manufacturer'] || 'mfr unknown'} | CAS: ${extracted['CAS Number'] || 'N/A'}`, 'success', 'search-log');
    } catch(e) {
      failed++;
      allData.push({ 'Resin Grade Name': name, '_error': e.message, '_ts': Date.now() });
      saveData();
      logMsg(`Failed: ${name} — ${e.message}`, 'error', 'search-log');
    }

    // Rate limit pause
    await new Promise(r => setTimeout(r, 600));
  }

  document.getElementById('search-btn').disabled = false;
  document.getElementById('search-icon').className = 'bi bi-search';
  document.getElementById('search-text').textContent = 'Search & Extract All';
  document.getElementById('search-progress-label').textContent = `Complete — ${done} found, ${failed} failed`;
  logMsg(`Done! ${done} found, ${failed} failed.`, done > 0 ? 'success' : 'error', 'search-log');
  updateNavCount();
  if (done > 0) { toast(`${done} resins extracted!`, 'success'); setTimeout(() => switchPanel('records', document.querySelector('[data-panel=records]')), 1800); }
}

// ─── TABLE ────────────────────────────────────────────────────────────────────
function populateFilters() {
  const typeSet = new Set(allData.map(r => r['Resin Type']).filter(Boolean));
  const countrySet = new Set(allData.map(r => r['Manufacturer Country Origin']).filter(Boolean));
  const typeEl = document.getElementById('filter-type');
  const ctryEl = document.getElementById('filter-country');
  const selType = typeEl.value;
  const selCtry = ctryEl.value;
  typeEl.innerHTML = '<option value="">All Resin Types</option>' + [...typeSet].sort().map(t => `<option value="${t}" ${t===selType?'selected':''}>${t}</option>`).join('');
  ctryEl.innerHTML = '<option value="">All Countries</option>' + [...countrySet].sort().map(c => `<option value="${c}" ${c===selCtry?'selected':''}>${c}</option>`).join('');
}

function filterTable() {
  const q = (document.getElementById('table-search')?.value || '').toLowerCase();
  const fType = document.getElementById('filter-type')?.value || '';
  const fCtry = document.getElementById('filter-country')?.value || '';

  filteredData = allData.filter(row => {
    const matchQ = !q || COLUMNS.some(col => (row[col] || '').toString().toLowerCase().includes(q));
    const matchT = !fType || (row['Resin Type'] || '') === fType;
    const matchC = !fCtry || (row['Manufacturer Country Origin'] || '') === fCtry;
    return matchQ && matchT && matchC;
  });

  if (sortCol !== null) {
    filteredData.sort((a, b) => {
      const av = (a[COLUMNS[sortCol]] || '').toString().toLowerCase();
      const bv = (b[COLUMNS[sortCol]] || '').toString().toLowerCase();
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });
  }

  currentPage = 1;
  populateFilters();
  renderTable();
  updateNavCount();
}

function clearFilters() {
  document.getElementById('table-search').value = '';
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-country').value = '';
  filterTable();
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  const empty = document.getElementById('table-empty');
  const pagBar = document.getElementById('pagination-bar');

  if (filteredData.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = '';
    pagBar.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = filteredData.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageData.map((row, idx) => {
    const realIdx = allData.indexOf(row);
    return `
    <tr>
      <td class="row-num">${start + idx + 1}</td>
      <td><span class="cell-clip" title="${esc(row['Resin Grade Name'])}">${row['Resin Grade Name'] || '<span class="cell-empty">—</span>'}</span></td>
      <td><span class="cell-clip" title="${esc(row['Resin Type'])}">${row['Resin Type'] || '<span class="cell-empty">—</span>'}</span></td>
      <td><span class="cell-clip" title="${esc(row['Chemical Name'])}">${row['Chemical Name'] || '<span class="cell-empty">—</span>'}</span></td>
      <td><span class="cell-clip">${row['Manufacturer'] || '<span class="cell-empty">—</span>'}</span></td>
      <td>${row['Manufacturer Country Origin'] || '<span class="cell-empty">—</span>'}</td>
      <td>${row['Chemical Formula'] || '<span class="cell-empty">—</span>'}</td>
      <td>${row['CAS Number'] || '<span class="cell-empty">—</span>'}</td>
      <td>${row['EINECS Number'] || '<span class="cell-empty">—</span>'}</td>
      <td><span class="cell-clip" title="${esc(row['Applications'])}">${row['Applications'] || '<span class="cell-empty">—</span>'}</span></td>
      <td>${row['TDS Link'] ? `<a href="${esc(row['TDS Link'])}" target="_blank" class="cell-link"><i class="bi bi-file-earmark-pdf-fill"></i> TDS</a>` : '<span class="cell-empty">—</span>'}</td>
      <td>
        <div class="row-actions">
          <button class="row-action-btn" title="View Details" onclick="openModal(${realIdx})"><i class="bi bi-eye-fill"></i></button>
          <button class="row-action-btn del" title="Delete" onclick="deleteRow(${realIdx})"><i class="bi bi-trash3-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Pagination
  const info = `Showing ${start+1}–${Math.min(start+PAGE_SIZE, filteredData.length)} of ${filteredData.length}`;
  let pages = '';
  const MAX_BTNS = 7;
  if (totalPages > 1) {
    let p_start = Math.max(1, currentPage - 3), p_end = Math.min(totalPages, p_start + MAX_BTNS - 1);
    if (p_end - p_start < MAX_BTNS - 1) p_start = Math.max(1, p_end - MAX_BTNS + 1);
    if (p_start > 1) pages += `<button class="page-btn" onclick="goPage(1)">1</button>${p_start > 2 ? '<span style="padding:0 4px;color:var(--dim)">…</span>' : ''}`;
    for (let p = p_start; p <= p_end; p++) pages += `<button class="page-btn ${p===currentPage?'active':''}" onclick="goPage(${p})">${p}</button>`;
    if (p_end < totalPages) pages += `${p_end < totalPages - 1 ? '<span style="padding:0 4px;color:var(--dim)">…</span>' : ''}<button class="page-btn" onclick="goPage(${totalPages})">${totalPages}</button>`;
  }
  pagBar.innerHTML = `
    <span>${info}</span>
    <div class="page-btns">
      <button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage<=1?'disabled':''}><i class="bi bi-chevron-left"></i></button>
      ${pages}
      <button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage>=totalPages?'disabled':''}><i class="bi bi-chevron-right"></i></button>
    </div>`;
}

function goPage(p) {
  const max = Math.ceil(filteredData.length / PAGE_SIZE);
  if (p < 1 || p > max) return;
  currentPage = p;
  renderTable();
  document.querySelector('.table-scroll')?.scrollTo(0, 0);
}

function deleteRow(idx) {
  if (!confirm('Delete this record?')) return;
  allData.splice(idx, 1);
  saveData();
  filterTable();
  toast('Record deleted', 'info');
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openModal(idx) {
  const row = allData[idx];
  if (!row) return;
  document.getElementById('modal-grade-name').textContent = row['Resin Grade Name'] || 'Unknown Resin';
  document.getElementById('modal-resin-type').textContent = row['Resin Type'] || '—';

  const fields = COLUMNS.map(col => {
    const isLink = col === 'TDS Link' || col === 'Manufacturer Website';
    const val = row[col];
    let valueHtml;
    if (isLink && val) valueHtml = `<a href="${esc(val)}" target="_blank" class="cell-link"><i class="bi bi-box-arrow-up-right"></i> ${val.length > 50 ? val.slice(0,50)+'…' : val}</a>`;
    else valueHtml = val ? esc(val) : '<span class="cell-empty">Not available</span>';
    const full = col === 'Applications' || col === 'Chemical Name' || col === 'TDS Link' || col === 'Manufacturer Website' ? 'full' : '';
    return `<div class="modal-field ${full}"><div class="modal-field-label">${col}</div><div class="modal-field-value">${valueHtml}</div></div>`;
  }).join('');
  document.getElementById('modal-body').innerHTML = fields;

  const tdsBtn = document.getElementById('modal-tds-btn');
  const webBtn = document.getElementById('modal-website-btn');
  if (row['TDS Link']) { tdsBtn.style.display = ''; tdsBtn.onclick = () => window.open(row['TDS Link'], '_blank'); }
  else tdsBtn.style.display = 'none';
  if (row['Manufacturer Website']) { webBtn.style.display = ''; webBtn.onclick = () => window.open(row['Manufacturer Website'], '_blank'); }
  else webBtn.style.display = 'none';

  document.getElementById('detail-modal').classList.add('open');
}
function closeModal(e) { if (e.target.id === 'detail-modal') closeModalDirect(); }
function closeModalDirect() { document.getElementById('detail-modal').classList.remove('open'); }

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportToExcel() {
  if (!allData.length) { toast('No data to export', 'warn'); return; }
  const wb = XLSX.utils.book_new();

  // Sheet3 - Full structured data
  const ws3rows = [COLUMNS, ...allData.map(row => COLUMNS.map(col => row[col] || ''))];
  const ws3 = XLSX.utils.aoa_to_sheet(ws3rows);
  ws3['!cols'] = COLUMNS.map(col => ({ wch: Math.min(45, Math.max(18, col.length + 6)) }));
  XLSX.utils.book_append_sheet(wb, ws3, 'Sheet3');

  // Sheet1 - Summary
  const ws1rows = [
    ['TDS Data Sheet of This resin Grade in PDF', 'Resin Grade Name', 'Resin Type', 'TDS Link', 'Group Category'],
    ...allData.map(r => ['TDS Data Sheet', r['Resin Grade Name'] || '', r['Resin Type'] || '', r['TDS Link'] || 'Not available', ''])
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(ws1rows);
  XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');

  const fname = `TDS_Intelligence_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fname);
  toast('Excel file downloaded!', 'success');
}

function exportCSV() {
  if (!allData.length) { toast('No data to export', 'warn'); return; }
  const csv = [COLUMNS.join(','), ...allData.map(r => COLUMNS.map(c => `"${(r[c]||'').toString().replace(/"/g,'""')}"`).join(','))].join('\n');
  downloadText(csv, `TDS_Data_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
  toast('CSV downloaded!', 'success');
}

function exportJSON() {
  if (!allData.length) { toast('No data to export', 'warn'); return; }
  downloadText(JSON.stringify(allData, null, 2), `TDS_Data_${new Date().toISOString().slice(0,10)}.json`, 'application/json');
  toast('JSON downloaded!', 'success');
}

function copyCSV() {
  if (!allData.length) { toast('No data to copy', 'warn'); return; }
  const csv = [COLUMNS.join('\t'), ...allData.map(r => COLUMNS.map(c => r[c] || '').join('\t'))].join('\n');
  navigator.clipboard.writeText(csv).then(() => toast('Copied to clipboard! Paste into Google Sheets.', 'success'));
}

function downloadText(content, filename, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename; a.click();
}

function updateExportStats() {
  document.getElementById('exp-total').textContent = allData.length;
  if (allData.length > 0) {
    const latest = Math.max(...allData.map(r => r['_ts'] || 0));
    document.getElementById('exp-date').textContent = latest ? new Date(latest).toLocaleDateString() : '—';
  }
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function esc(s) { return (s || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toast(msg, type = 'info') {
  const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill', warn: 'bi-exclamation-triangle-fill' };
  const wrap = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(24px)'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 300); }, 3200);
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModalDirect();
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); exportToExcel(); }
});
