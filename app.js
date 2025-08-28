const $ = sel => document.querySelector(sel);
const VERSION = '1.2.0';
const state = {
  queue: JSON.parse(localStorage.getItem('oc_queue')||'[]'),
  settings: JSON.parse(localStorage.getItem('oc_settings')||'{"endpointUrl":"","authHeaderKey":"","authHeaderValue":""}'),
  draft: JSON.parse(localStorage.getItem('oc_draft')||'{}')
};

function saveSettings(){const s={endpointUrl:$('#endpointUrl').value.trim(),authHeaderKey:$('#authHeaderKey').value.trim(),authHeaderValue:$('#authHeaderValue').value.trim()};
  state.settings=s;localStorage.setItem('oc_settings',JSON.stringify(s));alert('Settings saved.')}
function loadSettings(){$('#endpointUrl').value=state.settings.endpointUrl||'';$('#authHeaderKey').value=state.settings.authHeaderKey||'';$('#authHeaderValue').value=state.settings.authHeaderValue||''}

function gatherFormData(){return{
  timestamp:new Date().toISOString(),
  contactName:$('#contactName').value.trim(),
  role:$('#role').value,
  siteCity:$('#siteCity').value.trim(),
  environment:$('#environment').value,
  machine:$('#machine').value,
  targetView:$('#targetView').value.trim(),      // Proposed Camera Kit
  impactFreq:$('#impactFreq').value,             // visibility concern frequency
  timeLost:$('#timeLost').value,
  timeline:$('#timeline').value,                 // Level of Urgency
  reason:$('#reason').value,                     // Specific Reason (incl. Blind Lifts)
  reasonNote:$('#reasonNote').value.trim(),
  techInitials:$('#techInitials').value.trim().toUpperCase(),
  photos:[],
  appVersion:VERSION
}}

function validateCore(d){const req=['contactName','role','siteCity','environment','machine','impactFreq','timeLost','timeline','reason'];const miss=req.filter(k=>!d[k]);if(miss.length){alert('Missing fields: '+miss.join(', '));return false}return true}

async function fileToDataUrl(file,maxSize=1200,quality=0.8){
  const img=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=fr.result};fr.onerror=rej;fr.readAsDataURL(file)});
  const c=document.createElement('canvas');const ctx=c.getContext('2d');
  const ratio=Math.max(img.width,img.height)/maxSize;const w=ratio>1?Math.round(img.width/ratio):img.width;const h=ratio>1?Math.round(img.height/ratio):img.height;
  c.width=w;c.height=h;ctx.drawImage(img,0,0,w,h);return c.toDataURL('image/jpeg',quality)
}
async function handlePhotos(d){
  const f=$('#photos').files;if(!f||!f.length)return;const limit=Math.min(f.length,3);
  for(let i=0;i<limit;i++){const file=f[i];const dataUrl=await fileToDataUrl(file);d.photos.push({filename:file.name||`photo_${i+1}.jpg`,mimeType:'image/jpeg',dataUrl})}
}
function updatePreview(){const f=$('#photos').files;const p=$('#preview');p.innerHTML='';if(!f||!f.length)return;const limit=Math.min(f.length,3);for(let i=0;i<limit;i++){const url=URL.createObjectURL(f[i]);const img=document.createElement('img');img.src=url;p.appendChild(img)}}
function saveDraft(){const d=gatherFormData();state.draft=d;localStorage.setItem('oc_draft',JSON.stringify(d));alert('Draft saved to this device.')}
function loadDraft(){const d=state.draft;if(!d||!Object.keys(d).length)return;$('#contactName').value=d.contactName||'';$('#role').value=d.role||'';$('#siteCity').value=d.siteCity||'';$('#environment').value=d.environment||'';$('#machine').value=d.machine||'';$('#targetView').value=d.targetView||'';$('#impactFreq').value=d.impactFreq||'';$('#timeLost').value=d.timeLost||'';$('#timeline').value=d.timeline||'';$('#reason').value=d.reason||'';$('#reasonNote').value=d.reasonNote||'';$('#techInitials').value=d.techInitials||''}

async function queueSubmission(){
  const d=gatherFormData();if(!validateCore(d))return;await handlePhotos(d);
  state.queue.push({id:Date.now()+'_'+Math.random().toString(36).slice(2),data:d,status:'queued'});
  localStorage.setItem('oc_queue',JSON.stringify(state.queue));localStorage.removeItem('oc_draft');state.draft={};
  $('#contactName').value='';$('#role').value='';$('#siteCity').value='';$('#environment').value='';
  $('#machine').value='';$('#targetView').value='';$('#impactFreq').value='';$('#timeLost').value='';
  $('#timeline').value='';$('#reason').value='';$('#reasonNote').value='';$('#techInitials').value='';
  $('#photos').value=null;$('#preview').innerHTML='';
  alert('Queued on this device. Go to “Sync & Settings” to send when online.');
}

async function syncNow(){
  const url=($('#endpointUrl').value||'').trim();if(!url.startsWith('https://')){alert('Please enter a valid HTTPS endpoint URL.');return}
  const key=($('#authHeaderKey').value||'').trim();const val=($('#authHeaderValue').value||'').trim();
  const headers={'Content-Type':'application/json'};if(key&&val)headers[key]=val;
  let changed=false;
  for(const item of state.queue){
    if(item.status==='queued'||item.status==='failed'){
      try{const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(item.data)});if(!res.ok)throw new Error('HTTP '+res.status);item.status='synced';changed=true}
      catch(e){console.error('Sync error',e);item.status='failed';changed=true}
    }
  }
  if(changed)localStorage.setItem('oc_queue',JSON.stringify(state.queue));
  const totals=state.queue.reduce((a,it)=>{a[it.status]=(a[it.status]||0)+1;return a},{});
  alert(`Sync complete. Queued: ${totals.queued||0} • Synced: ${totals.synced||0} • Failed: ${totals.failed||0}`);
}

function exportJson(){const blob=new Blob([JSON.stringify(state.queue,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='opticrane_submissions.json';a.click();URL.revokeObjectURL(url)}
function toCsvRow(arr){return arr.map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(',')}
function exportCsv(){const rows=[];rows.push(['timestamp','contactName','role','siteCity','environment','machine','targetView','impactFreq','timeLost','timeline','reason','reasonNote','techInitials','photoCount']);for(const item of state.queue){const d=item.data||{};rows.push([d.timestamp,d.contactName,d.role,d.siteCity,d.environment,d.machine,d.targetView,d.impactFreq,d.timeLost,d.timeline,d.reason,d.reasonNote,d.techInitials,(d.photos||[]).length])}const csv=rows.map(toCsvRow).join('\n');const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='opticrane_submissions.csv';a.click();URL.revokeObjectURL(url)}
function clearAll(){if(!confirm('This will erase drafts and the local queue on this device. Continue?'))return;state.queue=[];state.draft={};localStorage.removeItem('oc_queue');localStorage.removeItem('oc_draft');alert('Local data cleared.')}
function openHelp(){$('#helpModal').classList.add('show');$('#helpModal').setAttribute('aria-hidden','false')}
function closeHelp(){$('#helpModal').classList.remove('show');$('#helpModal').setAttribute('aria-hidden','true')}

function init(){
  if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js')}
  $('#saveSettings').addEventListener('click',saveSettings);
  $('#saveDraft').addEventListener('click',saveDraft);
  $('#submit').addEventListener('click',queueSubmission);
  $('#syncNow').addEventListener('click',syncNow);
  $('#exportJson').addEventListener('click',exportJson);
  $('#exportCsv').addEventListener('click',exportCsv);
  $('#clearAll').addEventListener('click',clearAll);
  $('#photos').addEventListener('change',updatePreview);
  document.getElementById('helpBtn').addEventListener('click',openHelp);
  document.getElementById('closeHelp').addEventListener('click',closeHelp);
  loadSettings();loadDraft();
}
document.addEventListener('DOMContentLoaded',init);
