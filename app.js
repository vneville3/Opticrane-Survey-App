// Opticrane Survey App — Standard-only v1.3.1
const VERSION = '1.3.1';
const $ = (s)=>document.querySelector(s);

// SW update
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js?v='+VERSION).then(reg=>reg.update()).catch(console.error);
}

// Local state
const LS = { queue:'oc_queue', settings:'oc_settings', draft:'oc_draft' };
const state = {
  queue: JSON.parse(localStorage.getItem(LS.queue)||'[]'),
  settings: JSON.parse(localStorage.getItem(LS.settings)||'{"collectionEmail":"","subjectPrefix":"Opticrane Survey","backfillUrl":""}'),
  draft: JSON.parse(localStorage.getItem(LS.draft)||'{}')
};

// Photo buffer (so new picks don't overwrite old)
let photoBuffer = []; // {filename, mimeType, dataUrl}

// UI helpers
function toast(m){const t=$('#toast'); if(!t) return alert(m); t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200);}
function setStatus(m){const el=$('#syncStatus'); if(el) el.textContent=m||'';}
const fmtDate = (d)=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;

// Settings
function loadSettings(){ $('#collectionEmail').value=state.settings.collectionEmail||''; $('#subjectPrefix').value=state.settings.subjectPrefix||'Opticrane Survey'; $('#backfillUrl').value=state.settings.backfillUrl||''; }
function saveSettings(){
  state.settings = {
    collectionEmail: ($('#collectionEmail').value||'').trim(),
    subjectPrefix: ($('#subjectPrefix').value||'Opticrane Survey').trim(),
    backfillUrl: ($('#backfillUrl').value||'').trim()
  };
  localStorage.setItem(LS.settings, JSON.stringify(state.settings));
  toast('Settings saved.');
}

// Form data
function gatherFormData(){
  return {
    timestamp: new Date().toISOString(),
    contactName: $('#contactName').value.trim(),
    role: $('#role').value,
    siteCity: $('#siteCity').value.trim(),
    environment: $('#environment').value,
    machine: $('#machine').value,
    targetView: $('#targetView').value.trim(),
    impactFreq: $('#impactFreq').value,
    timeLost: $('#timeLost').value,
    timeline: $('#timeline').value,
    reason: $('#reason').value,
    reasonNote: $('#reasonNote').value.trim(),
    techInitials: $('#techInitials').value.trim().toUpperCase(),
    photos: [], // filled from buffer at submit
    appVersion: VERSION
  };
}
function validateCore(d){ const req=['contactName','role','siteCity','environment','machine','impactFreq','timeLost','timeline','reason']; const miss=req.filter(k=>!d[k]); if(miss.length){ alert('Missing: '+miss.join(', ')); return false;} return true; }

// Photos (compress + buffer)
async function fileToDataUrl(file,max=1200,quality=0.8){
  const img=await new Promise((res,rej)=>{const fr=new FileReader(); fr.onload=()=>{const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=fr.result;}; fr.onerror=rej; fr.readAsDataURL(file);});
  const c=document.createElement('canvas'),ctx=c.getContext('2d'); const r=Math.max(img.width,img.height)/max; const w=r>1?Math.round(img.width/r):img.width; const h=r>1?Math.round(img.height/r):img.height; c.width=w;c.height=h;ctx.drawImage(img,0,0,w,h); return c.toDataURL('image/jpeg',quality);
}
async function addFilesToBuffer(fileList){
  if (!fileList || !fileList.length) return;
  for (let i=0;i<fileList.length;i++){
    if (photoBuffer.length >= 3) break;
    const f = fileList[i];
    const dataUrl = await fileToDataUrl(f);
    photoBuffer.push({ filename: f.name || `photo_${photoBuffer.length+1}.jpg`, mimeType:'image/jpeg', dataUrl });
  }
  updatePreview();
}
function updatePreview(){
  const p=$('#preview'); const count=$('#photoCount');
  p.innerHTML='';
  photoBuffer.forEach((ph,idx)=>{
    const wrap=document.createElement('div'); wrap.className='thumb';
    const img=document.createElement('img'); img.src=ph.dataUrl; wrap.appendChild(img);
    const rm=document.createElement('button'); rm.type='button'; rm.textContent='×';
    rm.onclick=()=>{ photoBuffer.splice(idx,1); updatePreview(); };
    wrap.appendChild(rm); p.appendChild(wrap);
  });
  if (count) count.textContent = `${photoBuffer.length}/3 selected`;
}

// Draft & Queue
function saveDraft(){ const d=gatherFormData(); state.draft=d; localStorage.setItem(LS.draft, JSON.stringify(d)); toast('Draft saved.'); }
function loadDraft(){ const d=state.draft; if(!d||!Object.keys(d).length)return; ['contactName','role','siteCity','environment','machine','targetView','impactFreq','timeLost','timeline','reason','reasonNote','techInitials'].forEach(id=>{const el=$('#'+id); if(el) el.value=d[id]||'';}); updatePreview(); }
async function queueSubmission(){
  const d=gatherFormData(); if(!validateCore(d))return;
  d.photos = photoBuffer.slice(); // copy buffer
  state.queue.push({id:Date.now()+'_'+Math.random().toString(36).slice(2),data:d,status:'queued'});
  localStorage.setItem(LS.queue, JSON.stringify(state.queue));
  localStorage.removeItem(LS.draft); state.draft={};
  // reset form
  ['contactName','role','siteCity','environment','machine','targetView','impactFreq','timeLost','timeline','reason','reasonNote','techInitials'].forEach(id=>{const el=$('#'+id); if(el) el.value='';});
  photoBuffer=[]; updatePreview(); $('#photos').value=null;
  toast('Queued. Tap “Share Last Entry (Email)”.');
}

// Sharing
function dataUrlToFile(dataUrl, filename){ const [head,base]=dataUrl.split(','); const mime=(head.match(/data:(.*);base64/)||[])[1]||'application/octet-stream'; const bin=atob(base); const len=bin.length; const buf=new Uint8Array(len); for(let i=0;i<len;i++) buf[i]=bin.charCodeAt(i); return new File([buf], filename, {type:mime}); }
function jsonToFile(obj, filename){ const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}); return new File([blob], filename, {type:'application/json'}); }

async function shareLastEntry(){
  if(!state.queue.length){ alert('No entries queued yet.'); return; }
  const last = state.queue[state.queue.length-1].data;
  // Make filename so Mail uses it as the subject
  const dt = new Date(last.timestamp || Date.now());
  const subj = `${state.settings.subjectPrefix || 'Opticrane Survey'} — ${last.contactName || 'Contact'} — ${fmtDate(dt)}`;
  const safe = subj.replace(/[^\w\-\u00C0-\u017F ]+/g,'_').slice(0,80);
  const files = [];
  files.push(jsonToFile(last, `${safe}.json`)); // first attachment -> Mail uses as Subject
  (last.photos||[]).forEach((p,idx)=>files.push(dataUrlToFile(p.dataUrl, p.filename || `photo_${idx+1}.jpg`)));

  if (navigator.canShare && navigator.canShare({ files })) {
    try{
      await navigator.share({ files, title: subj, text: `To: ${state.settings.collectionEmail || 'you@opticrane.com'}` });
      toast('Shared. In Mail, pick the “To” contact and send.');
    }catch(e){ if(e.name!=='AbortError'){ alert('Share failed: '+e.message); } }
  } else {
    // Fallback (no attachments): prefill To/Subject/Body
    const body = encodeURIComponent(JSON.stringify(last, null, 2));
    const to = encodeURIComponent(state.settings.collectionEmail || '');
    location.href = `mailto:${to}?subject=${encodeURIComponent(subj)}&body=${body}`;
  }
}

// Exports & Clear
function exportJson(){ const blob=new Blob([JSON.stringify(state.queue,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='opticrane_queue.json'; a.click(); URL.revokeObjectURL(url); }
function toCsvRow(arr){return arr.map(v=>`"${(v??'').toString().replace(/"/g,'""')}"`).join(',')}
function exportCsv(){ const rows=[['timestamp','contactName','role','siteCity','environment','machine','targetView','impactFreq','timeLost','timeline','reason','reasonNote','techInitials','photoCount']]; for(const it of state.queue){const d=it.data||{}; rows.push([d.timestamp,d.contactName,d.role,d.siteCity,d.environment,d.machine,d.targetView,d.impactFreq,d.timeLost,d.timeline,d.reason,d.reasonNote,d.techInitials,(d.photos||[]).length]);} const csv=rows.map(toCsvRow).join('\n'); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='opticrane_queue.csv'; a.click(); URL.revokeObjectURL(url);}
function clearAll(){ if(!confirm('Erase drafts and the local queue on this device?')) return; state.queue=[]; state.draft={}; photoBuffer=[]; localStorage.removeItem(LS.queue); localStorage.removeItem(LS.draft); updatePreview(); setStatus(''); toast('Local data cleared.'); }

// Help / Backfill
function openHelp(){ $('#helpModal').classList.add('show'); $('#helpModal').setAttribute('aria-hidden','false'); }
function closeHelp(){ $('#helpModal').classList.remove('show'); $('#helpModal').setAttribute('aria-hidden','true'); }
function openBackfill(){ const url=($('#backfillUrl').value||'').trim(); if(!url){ alert('Add a Backfill form URL in Settings.'); return; } window.open(url,'_blank'); }

// Init
function init(){
  $('#saveSettings').addEventListener('click', saveSettings);
  $('#saveDraft').addEventListener('click', saveDraft);
  $('#submit').addEventListener('click', queueSubmission);
  $('#shareLast').addEventListener('click', shareLastEntry);
  $('#exportJson').addEventListener('click', exportJson);
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#clearAll').addEventListener('click', clearAll);
  $('#helpBtn').addEventListener('click', openHelp);
  $('#closeHelp').addEventListener('click', closeHelp);
  $('#backfill').addEventListener('click', openBackfill);

  // Photos: add/append
  $('#addPhoto').addEventListener('click', ()=>$('#photos').click());
  $('#photos').addEventListener('change', async (e)=>{ await addFilesToBuffer(e.target.files); e.target.value=null; });

  loadSettings(); loadDraft(); updatePreview();
}
document.addEventListener('DOMContentLoaded', init);
