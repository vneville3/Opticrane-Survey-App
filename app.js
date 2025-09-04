// ===== Opticrane Survey App v1.2.1 =====
const VERSION = '1.2.1';
const $ = (s) => document.querySelector(s);

// --- Service Worker (instant update) ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js?v=' + VERSION).then(reg => {
    // Check quickly for new SW
    reg.update();
    reg.onupdatefound = () => {
      const nw = reg.installing;
      nw && (nw.onstatechange = () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Update available — reloading…');
          setTimeout(() => location.reload(), 600);
        }
      });
    };
  }).catch(console.error);
}

// --- State ---
const LS_KEYS = {
  queue: 'oc_queue',
  settings: 'oc_settings',
  draft: 'oc_draft'
};

const state = {
  queue: JSON.parse(localStorage.getItem(LS_KEYS.queue) || '[]'),
  settings: JSON.parse(localStorage.getItem(LS_KEYS.settings) || '{"endpointUrl":"","queryToken":"","authHeaderKey":"","authHeaderValue":"","backfillUrl":""}'),
  draft: JSON.parse(localStorage.getItem(LS_KEYS.draft) || '{}')
};

// --- UI helpers ---
function toast(msg) {
  const t = $('#toast');
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function loadSettings() {
  $('#endpointUrl').value = state.settings.endpointUrl || '';
  $('#queryToken').value = state.settings.queryToken || '';
  $('#authHeaderKey').value = state.settings.authHeaderKey || '';
  $('#authHeaderValue').value = state.settings.authHeaderValue || '';
  $('#backfillUrl').value = state.settings.backfillUrl || '';
}

function saveSettings() {
  const s = {
    endpointUrl: $('#endpointUrl').value.trim(),
    queryToken: $('#queryToken').value.trim(),
    authHeaderKey: $('#authHeaderKey').value.trim(),
    authHeaderValue: $('#authHeaderValue').value.trim(),
    backfillUrl: $('#backfillUrl').value.trim()
  };
  state.settings = s;
  localStorage.setItem(LS_KEYS.settings, JSON.stringify(s));
  toast('Settings saved.');
}

// --- Form capture ---
function gatherFormData() {
  return {
    timestamp: new Date().toISOString(),
    contactName: $('#contactName').value.trim(),
    role: $('#role').value,
    siteCity: $('#siteCity').value.trim(),
    environment: $('#environment').value,
    machine: $('#machine').value,
    targetView: $('#targetView').value.trim(),   // Proposed kit (editable)
    impactFreq: $('#impactFreq').value,
    timeLost: $('#timeLost').value,
    timeline: $('#timeline').value,
    reason: $('#reason').value,
    reasonNote: $('#reasonNote').value.trim(),
    techInitials: $('#techInitials').value.trim().toUpperCase(),
    photos: [],
    appVersion: VERSION,
    assessment: computeAssessment() // include grade + suggestion in payload
  };
}

function validateCore(d) {
  const req = ['contactName','role','siteCity','environment','machine','impactFreq','timeLost','timeline','reason'];
  const miss = req.filter(k => !d[k]);
  if (miss.length) { alert('Missing fields: ' + miss.join(', ')); return false; }
  return true;
}

// --- Photos (compressed) ---
async function fileToDataUrl(file, maxSize = 1200, quality = 0.8) {
  const img = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = fr.result; };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const ratio = Math.max(img.width, img.height) / maxSize;
  const w = ratio > 1 ? Math.round(img.width / ratio) : img.width;
  const h = ratio > 1 ? Math.round(img.height / ratio) : img.height;
  c.width = w; c.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}

async function handlePhotos(d) {
  const f = $('#photos').files;
  if (!f || !f.length) return;
  const limit = Math.min(f.length, 3);
  for (let i = 0; i < limit; i++) {
    const file = f[i];
    const dataUrl = await fileToDataUrl(file);
    d.photos.push({ filename: file.name || `photo_${i+1}.jpg`, mimeType: 'image/jpeg', dataUrl });
  }
}

function updatePreview() {
  const f = $('#photos').files; const p = $('#preview'); p.innerHTML = '';
  if (!f || !f.length) return;
  const limit = Math.min(f.length, 3);
  for (let i = 0; i < limit; i++) {
    const url = URL.createObjectURL(f[i]);
    const img = document.createElement('img'); img.src = url; p.appendChild(img);
  }
}

// --- Drafts / Queue ---
function saveDraft() {
  const d = gatherFormData();
  state.draft = d; localStorage.setItem(LS_KEYS.draft, JSON.stringify(d));
  toast('Draft saved on this device.');
}

function loadDraft() {
  const d = state.draft; if (!d || !Object.keys(d).length) return;
  $('#contactName').value = d.contactName || '';
  $('#role').value = d.role || '';
  $('#siteCity').value = d.siteCity || '';
  $('#environment').value = d.environment || '';
  $('#machine').value = d.machine || '';
  $('#targetView').value = d.targetView || '';
  $('#impactFreq').value = d.impactFreq || '';
  $('#timeLost').value = d.timeLost || '';
  $('#timeline').value = d.timeline || '';
  $('#reason').value = d.reason || '';
  $('#reasonNote').value = d.reasonNote || '';
  $('#techInitials').value = d.techInitials || '';
  refreshAssessment();
}

async function queueSubmission() {
  const d = gatherFormData();
  if (!validateCore(d)) return;
  await handlePhotos(d);
  state.queue.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2), data: d, status: 'queued' });
  localStorage.setItem(LS_KEYS.queue, JSON.stringify(state.queue));
  localStorage.removeItem(LS_KEYS.draft); state.draft = {};
  // reset UI
  ['contactName','role','siteCity','environment','machine','targetView','impactFreq','timeLost','timeline','reason','reasonNote','techInitials'].forEach(id => { const el = $('#'+id); if (el) el.value = ''; });
  $('#photos').value = null; $('#preview').innerHTML = '';
  refreshAssessment();
  toast('Queued on this device. Use “Sync Now” when online.');
}

// --- Sync (endpoint + optional token + optional header) ---
function buildUrlWithToken(raw, token) {
  if (!raw) return '';
  if (!token) return raw;
  try {
    const u = new URL(raw);
    if (!u.searchParams.get('token')) u.searchParams.append('token', token);
    return u.toString();
  } catch { return raw + (raw.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token); }
}

async function syncNow() {
  const baseUrl = ($('#endpointUrl').value || '').trim();
  if (!baseUrl.startsWith('https://')) { alert('Enter a valid HTTPS Endpoint URL.'); return; }
  const url = buildUrlWithToken(baseUrl, ($('#queryToken').value || '').trim());
  const key = ($('#authHeaderKey').value || '').trim();
  const val = ($('#authHeaderValue').value || '').trim();
  const headers = { 'Content-Type': 'application/json' };
  if (key && val) headers[key] = val;

  let changed = false;
  for (const item of state.queue) {
    if (item.status === 'queued' || item.status === 'failed') {
      try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(item.data) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        item.status = 'synced'; changed = true;
      } catch (e) { console.error('Sync error', e); item.status = 'failed'; changed = true; }
    }
  }
  if (changed) localStorage.setItem(LS_KEYS.queue, JSON.stringify(state.queue));
  const totals = state.queue.reduce((a, it) => (a[it.status] = (a[it.status] || 0) + 1, a), {});
  toast(`Sync complete — Queued: ${totals.queued||0} • Synced: ${totals.synced||0} • Failed: ${totals.failed||0}`);
}

// --- Export / Clear ---
function exportJson() {
  const blob = new Blob([JSON.stringify(state.queue, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'opticrane_submissions.json'; a.click(); URL.revokeObjectURL(url);
}
function toCsvRow(arr){return arr.map(v=>`"${(v??'').toString().replace(/"/g,'""')}"`).join(',')}
function exportCsv(){
  const rows = [['timestamp','contactName','role','siteCity','environment','machine','targetView','impactFreq','timeLost','timeline','reason','reasonNote','techInitials','photoCount','grade','score','suggestion']];
  for (const item of state.queue) {
    const d = item.data||{};
    const a = d.assessment || {};
    rows.push([d.timestamp,d.contactName,d.role,d.siteCity,d.environment,d.machine,d.targetView,d.impactFreq,d.timeLost,d.timeline,d.reason,d.reasonNote,d.techInitials,(d.photos||[]).length,a.grade??'',a.score??'',a.suggestion??'']);
  }
  const csv = rows.map(toCsvRow).join('\n');
  const blob = new Blob([csv],{type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='opticrane_submissions.csv'; a.click(); URL.revokeObjectURL(url);
}
function clearAll(){
  if(!confirm('Erase drafts and the local queue on this device?')) return;
  state.queue=[]; state.draft={}; localStorage.removeItem(LS_KEYS.queue); localStorage.removeItem(LS_KEYS.draft);
  toast('Local data cleared.');
}

// --- Help / Backfill ---
function openHelp(){ $('#helpModal').classList.add('show'); $('#helpModal').setAttribute('aria-hidden','false'); }
function closeHelp(){ $('#helpModal').classList.remove('show'); $('#helpModal').setAttribute('aria-hidden','true'); }
function openBackfill(){
  const url = ($('#backfillUrl').value||'').trim();
  if (!url) { alert('Add a Backfill form URL in Settings.'); return; }
  window.open(url, '_blank');
}

// --- Assessment (A/B/C + suggestion) ---
function computeAssessment() {
  const freq = $('#impactFreq').value;
  const lost = $('#timeLost').value;
  const when = $('#timeline').value;
  const machine = $('#machine').value;
  const reason = $('#reason').value;
  const env = $('#environment').value;

  let score = 0;
  // Frequency
  if (freq === 'Daily') score += 3;
  else if (freq === 'Weekly') score += 2;
  else if (freq === 'Monthly') score += 1;

  // Time lost
  if (lost === '> 60 minutes') score += 3;
  else if (lost === '30–60 minutes') score += 2;
  else if (lost === '10–30 minutes') score += 1;

  // Urgency
  if (when === 'ASAP') score += 3;
  else if (when === 'This week') score += 2;
  else if (when === 'Later, during current project') score += 1;

  const grade = score >= 7 ? 'A' : score >= 4 ? 'B' : 'C';

  // Suggest kit (simple mapping, editable in UI)
  let suggestion = '';
  if (machine === 'Tower crane' || machine === 'Luffer') {
    if (reason === 'Blind Lifts' || reason === 'Better load alignment' || reason === 'Faster cycles (productivity)') {
      suggestion = 'LoadView (AF-Zoom + 7" monitor), quick-mount';
    } else {
      suggestion = 'LoadView (AF-Zoom) as primary';
    }
    if (reason === 'Night / low-light operations') suggestion += ' + low-light camera / IR assist';
  } else if (machine === 'Forklift/Telehandler') {
    suggestion = 'FAMOS rear + side (split-screen) blind-spot kit';
  } else if (machine === 'Excavator') {
    suggestion = 'FAMOS bucket cam + swing-side blind-spot';
  } else if (machine === 'PTZ (Supervisor Cam)') {
    suggestion = 'PTZ supervisor camera for site overview';
  } else {
    suggestion = 'Baseline blind-spot + operator view';
  }
  if (env === 'Warehouse & MHE') suggestion += ' (rugged MHE mounting)';

  // Autofill proposed kit if empty
  const target = $('#targetView');
  if (target && !target.value) target.value = suggestion;

  return { grade, score, suggestion };
}

function refreshAssessment() {
  const a = computeAssessment();
  const s = $('#scoreText'), sug = $('#suggestionText');
  if (s) s.textContent = `${a.grade} (${a.score})`;
  if (sug) sug.textContent = a.suggestion;
}

// --- Init ---
function init(){
  // Buttons
  $('#saveSettings').addEventListener('click', saveSettings);
  $('#saveDraft').addEventListener('click', saveDraft);
  $('#submit').addEventListener('click', queueSubmission);
  $('#syncNow').addEventListener('click', syncNow);
  $('#exportJson').addEventListener('click', exportJson);
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#clearAll').addEventListener('click', clearAll);
  $('#photos').addEventListener('change', updatePreview);
  $('#helpBtn').addEventListener('click', openHelp);
  $('#closeHelp').addEventListener('click', closeHelp);
  $('#backfill').addEventListener('click', openBackfill);

  // Recompute assessment on key inputs
  ['impactFreq','timeLost','timeline','machine','reason','environment'].forEach(id=>{
    const el = $('#'+id); if(el) el.addEventListener('change', refreshAssessment);
  });

  loadSettings(); loadDraft(); refreshAssessment();
}
document.addEventListener('DOMContentLoaded', init);
