Opticrane On‑Site Camera Discovery — PWA (iPhone‑friendly)
WHAT: Offline‑ready PWA to capture WHO/WHAT/WHERE/WHEN/WHY with photos, queue locally, and sync to a configurable HTTPS endpoint.
Deploy to any HTTPS static host. Add to iPhone Home Screen for full‑screen offline use.

SYNC ENDPOINT FORMAT
POST JSON with fields:
timestamp, contactName, role, siteCity, environment, machine, targetView, impactFreq, timeLost, timeline, reason, reasonNote, techInitials, photos[], appVersion.

Google Apps Script example endpoint (saves to Sheet):
function doPost(e){try{const b=JSON.parse(e.postData.contents);const ss=SpreadsheetApp.openById('YOUR_SHEET_ID');const sh=ss.getSheetByName('Submissions')||ss.insertSheet('Submissions');if(sh.getLastRow()===0){sh.appendRow(['timestamp','contactName','role','siteCity','environment','machine','targetView','impactFreq','timeLost','timeline','reason','reasonNote','techInitials','photoCount','photosJSON'])}sh.appendRow([b.timestamp,b.contactName,b.role,b.siteCity,b.environment,b.machine,b.targetView,b.impactFreq,b.timeLost,b.timeline,b.reason,b.reasonNote,b.techInitials,(b.photos||[]).length,JSON.stringify(b.photos||[])]);return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON)}catch(err){return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message})).setMimeType(ContentService.MimeType.JSON)}}

SECURITY
Use HTTPS, a token header, and limit spreadsheet access. Only capture business contact details.

iOS NOTES
No background sync; use “Sync Now”. Camera works via file input capture=environment.
