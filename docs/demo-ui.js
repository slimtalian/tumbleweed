'use strict';
// Demo-specific help keeps the application honest about where changes live.
function renderImports(){
 $('#content').innerHTML=`<section class="panel"><div class="margin-label">YOUR OWN COPY OF THE DEMO</div><h2>Try a thought. Make something of it.</h2><p>Everything here starts as fictional sample data. Capture a note, connect an idea, or finish a project step. Your saved changes belong to this browser.</p><div class="detail-actions"><button id="demo-export">Export this workspace</button><button id="demo-reset">Reset sample collection</button></div><p class="muted">Reset starts over with the samples. Export anything you want to keep first. Clearing your browser's site data also clears its saved demo changes.</p><label>Restore a Tumbleweed backup<input id="demo-restore-file" type="file" accept=".json,application/json"></label><button id="demo-restore">Review restore</button><p id="demo-error" role="alert"></p></section><section class="panel demo-help"><h2>Bring your own knowledge home.</h2><p>The downloadable local application starts empty and supports Markdown and graph imports. It saves your workspace and previous versions on your computer.</p><a class="demo-source-link" href="https://github.com/slimtalian/tumbleweed" target="_blank" rel="noopener noreferrer">Get the local application ↗</a></section>`;
 $('#demo-export').onclick=downloadBackup;$('#demo-reset').onclick=resetDemo;
 $('#demo-restore').onclick=async()=>{try{
  const file=$('#demo-restore-file').files[0];if(!file)throw new Error('Choose a backup first.');if(file.size>8*1024*1024)throw new Error('The browser demo supports backups up to 8 MB. Use the local app for larger collections.');
  const backup=TumbleweedDemoModel.validate(JSON.parse(await file.text()));
  if(await confirmAction('Restore this browser workspace?',`Replace this demo copy with ${Object.keys(backup.records).length} records? Export your current workspace first if you want to keep it.`)){await mutate({action:'restore',backup});toast('Backup restored in this browser.');}
 }catch(error){$('#demo-error').textContent=error.message;}};
}
async function resetDemo(){
 if(editorDirty||modalDrafts.size||taskDrafts.size){toast('Save or close your unfinished drafts before resetting.');return;}
 if(await confirmAction('Reset the sample collection?','This replaces your browser copy with the original fictional samples. Export your changes first if you want to keep them.')){
  try{await mutate({action:'reset-demo'});Specimen.picked.clear();persistGather();clearSpecimenFilters();rememberFilters();activeProject=null;navigate('graph');toast('The sample collection is ready to explore again.');}catch(error){toast(error.message);}
 }
}
function renderGuide(){
 $('#content').innerHTML=`<article class="panel guide"><h2>Start with a branch.</h2><p>Pull a branch or search for “water”, “repair”, or “research”. Open a record to read the context and inspect its sources.</p><h2>Gather a reason to act.</h2><p>Select useful records with Gather, then add them to a new or existing project. Write why they matter. Open Make to manage the outcome, tasks and next step.</p><h2>Every sample is fictional.</h2><p>Notes, conversations, decisions and project progress were written for this demo. A source marked as a sample is an illustration, not independently verified evidence. Dashed connections are inferred associations; their reasons remain visible.</p><h2>Your copy stays with you.</h2><p>Saved changes stay in this browser's IndexedDB storage. Other visitors have separate workspaces. Export a backup to keep a portable copy. Resetting or clearing site data starts over. If storage is unavailable, the demo works for this tab only and says so in its save status.</p><h2>Use Tumbleweed locally.</h2><p>The local application starts empty and lets you import selected Markdown files, vault ZIPs and curated graph bundles. It stores your workspace on your own computer.</p><p><a href="https://github.com/slimtalian/tumbleweed" target="_blank" rel="noopener noreferrer">Source and setup instructions ↗</a></p></article>`;
}
$('#demo-banner-reset').onclick=resetDemo;
