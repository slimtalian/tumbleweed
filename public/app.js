'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty = x => typeof x === 'string' ? x : JSON.stringify(x, null, 2);
const label = x => String(x || '').replaceAll('_', ' ');
const short = (x, n = 180) => String(x || '').length > n ? String(x).slice(0, n) + '…' : String(x || '');
const safeURL = u => {try {const v = new URL(u); return ['https:', 'http:'].includes(v.protocol) ? v.href : null;} catch {return null;}};
let state, token, dataPath, view = 'graph', page = 1, selected = null, previewData = null, graphCleanup = null, saveBusy = false;
const viewInfo = {
 graph: ['THE BIG PICTURE', 'Everything you know. Something you can use.', 'Follow a thread through your projects, experiences and evidence.', 'The tumbleweed'],
 projects: ['TURN KNOWLEDGE INTO WORK', 'A place for your next step.', 'Projects you deliberately choose to pursue, with useful knowledge close at hand.', 'Projects'],
 knowledge: ['YOUR REFERENCE LIBRARY', 'Keep the context.', 'Conversations, saved artifacts, notes and experience—with their evidence intact.', 'Knowledge'],
 discover: ['RELEVANCE, WITH A REASON', 'What could help this project?', 'Shared topics suggest places to look. You decide whether the connection matters.', 'Discover connections'],
 decisions: ['REASONS WORTH KEEPING', 'Remember why you chose.', 'Your current decision notes and historical reported decisions remain distinct.', 'Decisions'],
 imports: ['LOCAL OWNERSHIP', 'Bring it in. Keep it safe.', 'Preview imports, review conflicts, and export a complete restorable backup.', 'Imports & backups'],
 review: ['A CLEARER COLLECTION', 'Know what is here.', 'Readable organization, preserved evidence, and gaps you can inspect.', 'Collection review'],
 guide: ['A SMALL FIELD GUIDE', 'Work you can understand.', 'How this local workspace stores knowledge, connects it, and helps you return.', 'Field guide']
};
function record(r) {
 if (!r.imported) return Catalog.decorate({...r, coverage:'local_note', source_ids:[], claims:[], dates:r.created_at || ''});
 const raw = r.raw;
 return Catalog.decorate({...raw, ...r.annotations, id:r.id, external_id:r.external_id, namespace:r.namespace, imported:true, raw, annotations:r.annotations, historical:raw.coverage!=='local_markdown', kind:raw.kind, title:r.annotations?.title || raw.title, summary:raw.summary});
}
const records = () => Object.values(state.records).map(record);
const get = id => state.records[id] && record(state.records[id]);
function toast(message) {$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,6000);}
async function api(path, body) {
 const res = await fetch(path, body ? {method:'POST',headers:{'Content-Type':'application/json','X-Tumbleweed-Token':token},body:JSON.stringify(body)} : {});
 let result; try {result=await res.json();} catch {throw new Error('The local server did not return a valid response.');}
 if (!res.ok) throw new Error(result.error || 'Request failed.');
 return result;
}
async function load() {
 try {const result=await api('/api/state');state=result.state;token=result.token;dataPath=result.data_path;refreshFilters();restoreFilters();render();$('#save-label').textContent='Saved on disk · revision '+state.revision;return true;}
 catch(e){$('#content').innerHTML=`<div class="error-banner">${esc(e.message)} Start Tumbleweed using Start Tumbleweed.cmd, then reload.</div>`;return false;}
}
async function mutate(body) {
 if(saveBusy) throw new Error('A save is already in progress.');
 saveBusy=true;$('#save-label').textContent='Saving…';
 try {const result=await api(body.action==='restore'?'/api/restore':'/api/mutate',{...body,revision:state.revision});state=result.state;refreshFilters();render();$('#save-label').textContent='Saved on disk · revision '+state.revision;return state;}
 catch(e){$('#save-label').textContent='Save failed · changes not saved';throw e;}
 finally {saveBusy=false;}
}
function refreshFilters() {
 for (const [selector, vals, all] of [['#collection',records().map(r=>r.collection),'All collections'],['#topic',records().flatMap(r=>r.topics || []),'All topics'],['#coverage',records().map(r=>r.evidence_label),'All evidence']]) {
  const el=$(selector), keep=el.value;
  el.innerHTML=`<option value="">${all}</option>`+[...new Set(vals.filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">${esc(selector==='#topic'?Catalog.topicLabel(v):label(v))}</option>`).join('');el.value=keep;
 }
}
function dateText(r) {return pretty(r.dates || r.created_at || 'Date unavailable');}
function dateValues(r) {return dateText(r).match(/\d{4}-\d{2}-\d{2}/g) || [];}
function filtered() {
 const q=$('#search').value.toLowerCase().trim().split(/\s+/).filter(Boolean), topic=$('#topic').value, cov=$('#coverage').value, from=$('#from-date').value, to=$('#to-date').value;
 return records().filter(r=>{
  if(r.archived && !$('#archived').checked) return false;
  if(topic && !(r.topics || []).includes(topic)) return false;
  if($('#collection').value && r.collection!==$('#collection').value) return false;
  if(cov && r.evidence_label!==cov) return false;
  if(from || to) {const dates=dateValues(r);if(!dates.some(d=>(!from || d>=from)&&(!to || d<=to)))return false;}
  if(!q.length)return true;
  const text=JSON.stringify([r.title,r.summary,r.raw?.summary,r.topics,r.claims,r.next_action,r.external_id,r.source_title,r.collection,r.annotations?.summary,r.raw?.messages,r.tasks,r.stopped_at,r.put_away,r.url,sourcesFor(r).map(s=>s.raw)]).toLowerCase();
  return q.every(term=>text.includes(term));
 }).sort((a,b)=>$('#sort').value==='recent'?(dateValues(b).sort().at(-1)||'').localeCompare(dateValues(a).sort().at(-1)||'')||a.title.localeCompare(b.title):a.title.localeCompare(b.title));
}
function empty(title,text,button='') {return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p>${button}</div>`;}
function card(r) {
 const tasks=r.tasks || [], done=tasks.filter(t=>t.done).length;
 return `<button class="record-card" data-open="${esc(r.id)}"><div class="card-meta"><span class="legend-dot" style="background:${color(r)}"></span>${esc(label(r.kind))}${r.archived?' · archived':''}${r.imported?(r.historical?' · historical':' · imported'):''}</div><h3>${esc(r.title)}</h3><div class="small-label">${esc(r.collection)} · ${esc(r.evidence_label)}</div><p>${esc(r.summary || r.next_action || 'Open to add context and a next step.')}</p>${tasks.length?`<div class="small-label">${done} / ${tasks.length} tasks complete<div class="progress"><span style="width:${done/tasks.length*100}%"></span></div></div>`:''}<div class="tags">${(r.topics || []).slice(0,3).map(t=>`<span class="tag">${esc(Catalog.topicLabel(t))}</span>`).join('')}</div></button>`;
}
function cards(list, paginate=true) {
 const size=24, total=Math.ceil(list.length/size);page=Math.min(page,Math.max(total,1));
 const rows=paginate?list.slice((page-1)*size,page*size):list;
 return `<div class="cards">${rows.map(card).join('')}</div>${paginate&&total>1?`<div class="pagination"><button id="prev-page" ${page===1?'disabled':''}>Previous</button><span>Page ${page} of ${total}</span><button id="next-page" ${page===total?'disabled':''}>Next</button></div>`:''}`;
}
function navigate(next) {$('#detail').close();$('.workspace-tools').open=false;view=next in viewInfo?next:'graph';page=1;if(location.hash!=='#'+view)history.pushState(null,'','#'+view);$('.sidebar').classList.remove('mobile-open');$('#menu-toggle').setAttribute('aria-expanded','false');render();window.scrollTo({top:0,behavior:'instant'});}
function render() {
 if(!state) return;
 document.body.dataset.view=view;
 const activeFilters=['collection','topic','coverage','from-date','to-date'].filter(id=>$('#'+id).value).length+Number($('#archived').checked);$('#filter-toggle').textContent='Filters'+(activeFilters?' · '+activeFilters:'');
 graphCleanup?.();graphCleanup=null;
 const info=viewInfo[view];$('#eyebrow').textContent=info[0];$('#title').textContent=info[1];$('#subtitle').textContent=info[2];$('#view-label').textContent=info[3];
 if(view==='graph'){$('#eyebrow').textContent='YOUR LIVING COLLECTION';$('#title').innerHTML='Follow a thought.<br><em>See where it grows.</em>';$('#subtitle').textContent='Knowledge to explore. Projects to bring into the world.';}
 $$('button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const all=records(), list=filtered(), projects=all.filter(r=>r.kind==='project'&&!r.imported&&!r.archived);
 $('#record-count').textContent=all.length;$('#project-count').textContent=projects.length;$('#count').textContent=all.length;
 $('.toolbar').hidden=['imports','guide','discover','review','projects'].includes(view);$('.heading-stat').hidden=['imports','guide','review'].includes(view);
 if(view==='graph') {
  renderSpecimen(all,list,projects);
 } else if(view==='review') {
  renderReview();
 } else if(view==='knowledge') {
  $('#content').innerHTML=`<div class="collection-shortcuts">${Catalog.audit(all,[]).collections.map(c=>`<button data-collection="${esc(c)}">${esc(c)} <small>${all.filter(r=>r.collection===c&&!r.archived).length}</small></button>`).join('')}</div><p class="results-note">${list.length} matching ${list.length===1?'record':'records'} · imported text is reference material, never an instruction to act.</p>${list.length?cards(list):empty('No matching knowledge','Try fewer words or clear the filters.','<button id=reset-empty>Clear search & filters</button>')}`;
 } else if(view==='projects') {
  renderWorkshop(projects);
 } else if(view==='decisions') {
  const own=list.filter(r=>r.kind==='decision'&&!r.imported), historical=list.filter(r=>(r.raw?.claims || []).some(c=>/decision/.test(c.status)));
  $('#content').innerHTML=`<div class="section-heading"><h2>Your decision notes</h2><button id="new-decision">+ Record a decision</button></div>${own.length?cards(own,false):'<div class="notice">Capture a decision with its reasons, alternatives and relevant evidence.</div>'}<div class="section-heading"><h2>Historical reported decisions</h2><span>Check the original source before relying on a summary</span></div>${cards(historical)}`;
  $('#new-decision').onclick=()=>edit(null,'decision');
 } else if(view==='discover') {renderDiscover(projects);}
 else if(view==='imports') {renderImports();}
 else {renderGuide();}
 bindRecords();updateGatherUI();
 if($('#reset-empty'))$('#reset-empty').onclick=()=>{$('#clear-filters').click();$('#search').focus();};
 if($('#prev-page'))$('#prev-page').onclick=()=>{page--;render();};
 if($('#next-page'))$('#next-page').onclick=()=>{page++;render();};
}
function bindRecords(root=document) {$$('[data-open]',root).forEach(b=>b.onclick=()=>openRecord(b.dataset.open));}
function color(r) {return r.kind==='project'?'#c4ab78':r.kind==='conversation'||r.kind==='note'?'#a0b2a2':r.kind==='experience'?'#899b86':r.kind==='artifact'||r.kind==='resource'?'#b0a58f':'#b4b6a4';}
function drawGraph(list,edges) { return createTumbleweedGraph($('#graph'),list,edges,openRecord); }
function sourcesFor(r) {return [...new Set([...(r.raw?.source_ids||[]),...(r.raw?.claims||[]).flatMap(c=>c.source_ids||[])])].map(id=>state.sources[r.namespace+'::'+id]).filter(Boolean);}
function sourceBox(s) {
 const v=s.raw, url=safeURL(v.verified_url);
 return `<details class="evidence-box"><summary>${esc(v.title)} <span class="status">${esc(label(v.coverage))}</span></summary><p class="source-id">${esc(v.id)}</p><p>${esc(v.read_scope || 'No additional read scope supplied.')}</p>${url?`<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open verified source</a></p>`:'<p class="muted">No verified source URL is supplied. Use the locator and search hints below; Library IDs are not public links.</p>'}<strong class="small-label">SOURCE LOCATOR & SEARCH HINTS</strong><pre>${esc(pretty({locator:v.locator,search_hints:v.search_hints,source_message_ids:v.source_message_ids,evidence:v.evidence}))}</pre><button data-copy-source="${esc(s.id)}">Copy source locator</button></details>`;
}
let recordTrail=[];
function openRecord(id,back=false) {
 if(get(id)?.kind==='project'&&!get(id).imported&&!get(id).archived){activeProject=id;navigate('projects');return;}
 if($('#detail').open&&selected!==id&&!back)recordTrail.push(selected);
 if(!$('#detail').open)recordTrail=[];
 const r=get(id);if(!r)return;selected=id;
 const edges=Object.values(state.edges).filter(e=>e.from===id||e.to===id), sources=sourcesFor(r), claims=r.raw?.claims || [], annotations=r.annotations || {};
 $('#detail-content').innerHTML=`<div class="dialog-head"><div><div class="eyebrow">${esc(label(r.kind))} ${r.imported?(r.historical?'· HISTORICAL REFERENCE':'· IMPORTED NOTE'):''}</div><h2>${esc(r.title)}</h2></div><button data-close="detail" aria-label="Close record">×</button></div><p class="muted">${esc(r.collection)}${r.source_title!==r.title?' · Original title: '+esc(r.source_title):''}</p><div class="tags"><span class="status">${esc(r.evidence_label)}</span>${r.status?`<span class="status">${esc(r.status)}</span>`:''}${r.archived?'<span class="status">Archived</span>':''}</div><div class="detail-actions"><button id="edit-record">${r.imported?'Notes':'Edit'}</button><button id="connect-record">Connect</button>${r.imported||r.kind!=='project'?'<button id="project-from-record">Start project</button>':''}<button id="archive-record">${r.archived?'Unarchive':'Archive'}</button></div>${r.historical?'<div class="notice">Historical source. Verify before relying on it.</div>':r.imported?'<div class="notice">Original preserved. Your notes stay separate.</div>':''}<div class="prose">${esc(r.imported?r.raw.summary:r.summary)}</div>${r.imported&&annotations.summary?`<section class="detail-section"><h3>Your local notes</h3><div class="prose">${esc(annotations.summary)}</div></section>`:''}${r.url&&safeURL(r.url)?`<p><a href="${esc(safeURL(r.url))}" target="_blank" rel="noopener noreferrer">Open resource link</a></p>`:''}
 ${messageReader(r)}
 ${r.kind==='project'?`<section class="detail-section"><h3>Where to resume</h3><div class="evidence-box"><p><strong>I stopped at:</strong> ${esc(r.stopped_at || 'Not recorded')}</p><p><strong>Next time, start with:</strong> ${esc(r.next_action || 'Choose one concrete next step')}</p><p><strong>Before leaving, put away:</strong> ${esc(r.put_away || 'Not recorded')}</p></div><h3>Tasks</h3><div class="tasks">${(r.tasks||[]).map((t,i)=>`<label class="${t.done?'done':''}"><input type="checkbox" data-task="${i}" ${r.imported?'disabled':''} ${t.done?'checked':''}>${esc(t.text)}</label>`).join('')||'<p class="muted">Edit this project to add tasks.</p>'}</div></section>`:''}
 <section class="detail-section"><h3>Topics</h3><div class="topic-buttons">${(r.topics||[]).map(t=>`<button data-topic="${esc(t)}">${esc(Catalog.topicLabel(t))}</button>`).join('')||'<span class="muted">No topics yet.</span>'}</div></section>
 ${claims.length?`<section class="detail-section"><h3>Claims & open questions</h3>${claims.map(c=>`<div class="evidence-box"><span class="status ${/proposal|question/.test(c.status)?'inferred':''}">${esc(label(c.status))}</span><p>${esc(pretty(c.text))}</p><div class="source-id">${esc((c.source_ids||[]).join(' · '))}</div></div>`).join('')}</section>`:''}
 <section class="detail-section"><h3>Relationships & backlinks <span class="muted">(${edges.length})</span></h3>${edges.map(e=>{const outgoing=e.from===id, other=get(outgoing?e.to:e.from);return `<div class="connection"><span class="direction">${outgoing?'↗':'↙'}</span><div><small>${outgoing?'Outgoing':'Incoming backlink'} · ${esc(label(e.relation))}</small><br><button class="record-link" data-open="${esc(other.id)}">${esc(other.title)}</button><p>${esc(e.rationale)}</p><span class="status ${e.basis==='inferred'?'inferred':''}">${esc(e.basis)}</span>${e.raw?`<details><summary class="small-label">Relationship evidence</summary><pre class="raw">${esc(pretty({source_ids:e.raw.source_ids,evidence:e.raw.evidence}))}</pre></details>`:''}</div>${!e.namespace?`<button data-unlink="${esc(e.id)}" aria-label="Remove this local relationship">×</button>`:''}</div>`;}).join('')||'<p class="muted">No relationships yet. Connect relevant knowledge and explain why it matters.</p>'}</section>
 ${sources.length?`<section class="detail-section"><h3>Sources & backtracking</h3>${sources.map(sourceBox).join('')}</section>`:''}
 <section class="detail-section"><details class="evidence-box"><summary>Dates, identifiers & original data</summary><p class="source-id">${esc(r.external_id || r.id)}</p><pre>${esc(dateText(r))}</pre><pre>${esc(pretty(r.raw || state.records[id]))}</pre></details></section>`;
 const detailHead=$('.dialog-head',$('#detail'));
 if(recordTrail.length){const b=document.createElement('button');b.textContent='← Previous record';b.onclick=()=>openRecord(recordTrail.pop(),true);detailHead.before(b);}
 // Keep the first reading surface quiet; evidence remains one click away.
 $$('section.detail-section',$('#detail')).forEach(section=>{const heading=$('h3',section);if(!heading||heading.textContent==='Your local notes')return;const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=heading.textContent;heading.remove();while(section.firstChild)details.append(section.firstChild);details.prepend(summary);section.append(details);});
 if((r.imported||r.kind!=='project')&&!r.archived){const pick=document.createElement('button');pick.dataset.pick=id;pick.textContent=Specimen.picked.has(id)?'✓ Gathered':'+ Gather';pick.setAttribute('aria-pressed',String(Specimen.picked.has(id)));$('.detail-actions',$('#detail')).prepend(pick);}
 if(activeProject&&view==='projects'&&!Object.values(state.edges).some(e=>(e.from===id&&e.to===activeProject)||(e.to===id&&e.from===activeProject))){const pin=document.createElement('button');pin.textContent='Attach to this project';pin.onclick=()=>link(id,activeProject);$('.detail-actions',$('#detail')).append(pin);}
 bindRecords($('#detail'));bindClose($('#detail'));
 $('#detail').scrollTop=0;
 $$('[data-topic]',$('#detail')).forEach(b=>b.onclick=()=>{$('#detail').close();$('#topic').value=b.dataset.topic;navigate('knowledge');});
 $$('[data-copy-source]',$('#detail')).forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(pretty(state.sources[b.dataset.copySource].raw));toast('Source locator copied.');}catch{toast('Clipboard unavailable. Select and copy the locator text.');}});
 $('#edit-record').onclick=()=>edit(id);$('#connect-record').onclick=()=>link(id);
 if($('#project-from-record'))$('#project-from-record').onclick=()=>edit(null,'project',r);
 $('#archive-record').onclick=async()=>{try{await mutate({action:'archive-record',id,archived:!r.archived});openRecord(id);toast(r.archived?'Record restored to the collection.':'Record archived. Its evidence and links are retained.');}catch(e){toast(e.message);}};
 $$('[data-task]').forEach(b=>b.onchange=async()=>{const tasks=structuredClone(r.tasks);tasks[Number(b.dataset.task)].done=b.checked;try{await mutate({action:'save-record',record:{...r,tasks}});openRecord(id);}catch(e){b.checked=!b.checked;toast(e.message);}});
 $$('[data-unlink]').forEach(b=>b.onclick=async()=>{if(await confirmAction('Remove this relationship?','A disk backup is saved before the change. The records themselves are retained.')){try{await mutate({action:'unlink',id:b.dataset.unlink});openRecord(id);}catch(e){toast(e.message);}}});
 if(!$('#detail').open){if(matchMedia('(max-width:760px)').matches)$('#detail').showModal();else $('#detail').show();}
 $('#detail').setAttribute('aria-label','Knowledge reader');
}
let projectOrigin=null;
function edit(id=null,kind='note',origin=null) {
 const form=$('#edit-form');form.reset();projectOrigin=origin?.id || null;
 const r=id?get(id):{kind,status:kind==='project'?'planned':'reference',title:origin?'Project: '+origin.title:'',topics:origin?.topics || [],summary:'',tasks:[]};
 $('#editor-title').textContent=id?(r.imported?'Your notes on this evidence':'Edit '+label(r.kind)):'Capture '+label(kind);
 for(const name of ['id','title','collection','kind','status','summary','url','stopped_at','next_action','put_away']) form.elements[name].value=r[name] || '';
 $('.form-grid',form).hidden=!!r.imported;form.elements.kind.disabled=!!r.imported;form.elements.status.disabled=!!r.imported;
 if(r.imported){form.elements.kind.value='note';form.elements.summary.value=r.annotations?.summary || '';}
 form.elements.topics.value=(r.topics || []).join(', ');form.elements.tasks.value=(r.tasks || []).map(t=>(t.done?'[x] ':'')+t.text).join('\n');
 $('#edit-note').textContent=r.imported?'Your edits are local annotations. The original imported record, claims and sources are preserved.':origin?'This creates a separate record linked to the original context. Historical evidence remains intact.':'';
 $('.form-error',form).textContent='';showProjectFields();$('#editor').showModal();setTimeout(()=>form.elements.title.focus(),50);
}
function showProjectFields() {$('.project-fields').hidden=$('#edit-form').elements.kind.value!=='project';}
$('#edit-form').elements.kind.onchange=showProjectFields;
$('#edit-form').onsubmit=async e=>{
 e.preventDefault();const form=e.currentTarget, data=Object.fromEntries(new FormData(form));
 if(form.elements.kind.disabled){delete data.kind;delete data.status;for(const key of ['tasks','stopped_at','next_action','put_away'])delete data[key];}
 data.topics=data.topics.split(',').map(t=>t.trim()).filter(Boolean);if(data.tasks!==undefined)data.tasks=TumbleweedContext.parseTasks(data.tasks,data.id?get(data.id)?.tasks:[]);
 const before=new Set(Object.keys(state.records));const submit=$('button[type=submit]',form);submit.disabled=true;form.inert=true;
 try {await mutate({action:'save-record',record:data,origin:projectOrigin});const id=data.id||Object.keys(state.records).find(k=>!before.has(k));$('#editor').close();openRecord(id);toast('Saved locally.');}
 catch(err){showSaveError(form,err);}
 finally{submit.disabled=false;form.inert=false;}
};
function showSaveError(form,error){
 const box=$('.form-error',form);box.textContent=error.message;
 if(/another window|no longer exists|Reload this local app/.test(error.message)){
  const retry=document.createElement('button');retry.type='button';retry.textContent='Refresh workspace; keep this draft';
  retry.onclick=async()=>{if(await load())box.textContent='Workspace refreshed. Your draft remains here. Review it before saving; it may replace newer local notes.';else box.textContent='Could not refresh. Your draft remains here; start the local server and try again.';};
  box.append(retry);
 }
}
function link(from,to=null,rationale='') {
 const form=$('#link-form');form.reset();const rows=records().filter(r=>!r.archived).sort((a,b)=>a.title.localeCompare(b.title));
 const options=rows.map(r=>`<option value="${esc(r.id)}">${esc(r.title)} · ${esc(label(r.kind))}</option>`).join('');
 form.elements.from.innerHTML=options;form.elements.to.innerHTML=options;form.elements.from.value=from || rows[0]?.id || '';form.elements.to.value=to || rows.find(r=>r.id!==from)?.id || '';form.elements.rationale.value=rationale;$('.form-error',form).textContent='';$('#link-dialog').showModal();
}
$('#link-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;const submit=$('button.primary',form);submit.disabled=true;form.inert=true;try{await mutate({action:'link',edge:Object.fromEntries(new FormData(form))});$('#link-dialog').close();if($('#detail').open)openRecord(selected);toast('Relationship saved with its rationale.');}catch(err){showSaveError(form,err);}finally{submit.disabled=false;form.inert=false;}};
function confirmAction(title,text) {if($('#confirm-dialog').open)return Promise.resolve(false);return new Promise(resolve=>{const d=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;d.showModal();$('#confirm-yes').onclick=()=>{d.close();resolve(true);};$('#confirm-no').onclick=()=>{d.close();resolve(false);};d.oncancel=()=>resolve(false);});}
function bindClose(root=document) {$$('[data-close]',root).forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());}
function renderDiscover(projects) {
 $('#content').innerHTML=projects.length?`<section class="panel"><label for="discover-project">Choose a project</label> <select id="discover-project">${projects.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select><p class="muted">Suggestions compare exact shared topics. Existing connections and archived records are excluded. No AI or external service is used.</p></section><div id="suggestions" class="preview"></div>`:empty('Choose a project first','Create a project and give it topics. Discovery will show relevant knowledge and explain the shared topics.','<button id="discover-create" class="primary">Create a project</button>');
 if($('#discover-create')){$('#discover-create').onclick=()=>edit(null,'project');return;}
 const renderSuggestions=()=>{
  const p=get($('#discover-project').value), linked=new Set(Object.values(state.edges).filter(e=>e.from===p.id||e.to===p.id).map(e=>e.from===p.id?e.to:e.from));
  const topics=new Set((p.topics||[]).map(x=>x.toLowerCase()));
  const suggestions=records().filter(r=>r.id!==p.id&&!r.archived&&!linked.has(r.id)).map(r=>({r,shared:(r.topics||[]).filter(t=>topics.has(t.toLowerCase()))})).filter(x=>x.shared.length).sort((a,b)=>b.shared.length-a.shared.length).slice(0,15);
  $('#suggestions').innerHTML=suggestions.length?suggestions.map(({r,shared})=>`<section class="panel suggestion"><div class="eyebrow">POSSIBLE RELEVANCE · ${shared.length} SHARED TOPIC${shared.length===1?'':'S'}</div><h3>${esc(r.title)}</h3><div class="small-label">${esc(r.collection)} · ${esc(r.evidence_label)}</div><p>${esc(short(r.summary,300))}</p><div class="tags">${shared.map(t=>`<span class="tag">${esc(Catalog.topicLabel(t))}</span>`).join('')}</div><p class="muted">Shared topics are a navigation hint, not proof of usefulness or a dependency.</p><footer><button data-open="${esc(r.id)}">Inspect evidence</button><button data-suggest="${esc(r.id)}" data-shared="${esc(shared.join(', '))}">Review connection</button></footer></section>`).join(''):empty('No unconnected topic matches','Add relevant topics to your project, or inspect records and connect them manually.');
  bindRecords($('#suggestions'));$$('[data-suggest]').forEach(b=>b.onclick=()=>link(b.dataset.suggest,p.id,'Potentially relevant because of shared topics: '+b.dataset.shared+'. Review the evidence before relying on this association.'));
 };
 $('#discover-project').onchange=renderSuggestions;renderSuggestions();
}
function renderImports() {
 $('#content').innerHTML=`<div class="notice">Import your own knowledge. Preview changes before saving; repeated IDs will not create duplicates. Sensitive or unassessed graph records are rejected. Select only Markdown notes you intend to include.</div><div class="import-grid"><section class="panel"><h2>Curated knowledge bundle</h2><p>Choose <strong>graph.json</strong>. Keep the same namespace when importing a newer version of that bundle.</p><label>Bundle namespace<input id="namespace" value="my-knowledge" pattern="[a-z0-9_-]+"></label><label>Graph JSON<input id="graph-file" type="file" accept=".json,application/json"></label><button id="preview-graph">Validate & preview</button></section><section class="panel"><h2>Obsidian & Markdown</h2><p>Import selected .md files or a vault ZIP. Original text and relative paths are kept; supported note links become backlinks.</p><label>Vault namespace<input id="vault-namespace" value="my-vault"></label><label>Markdown files or ZIP<input id="markdown-files" type="file" accept=".md,.zip" multiple></label><button id="preview-markdown">Review selected notes</button><p class="muted">One-way import. Attachments are not imported. Hidden folders and optional_sensitive, tools and raw-export staging folders are excluded.</p></section></div><div id="import-preview" class="preview"></div><div class="section-heading"><h2>Backups & recovery</h2></div><section class="panel"><p>Every change saves the previous workspace in <strong>data/backups</strong>. Export a portable backup before moving the app or restoring another workspace.</p><button id="backup-panel">Export complete backup</button><label class="muted"> Restore a Tumbleweed Local backup <input id="restore-file" type="file" accept=".json"></label><button id="restore">Review restore</button><p class="small-label">Current file: ${esc(dataPath)}</p></section><div class="section-heading"><h2>Import history</h2></div><section class="panel">${[...state.batches].reverse().map(b=>`<div class="history-row"><div><strong>${esc(b.namespace)}</strong> · ${b.count} changed items<small>${esc(new Date(b.date).toLocaleString())}${b.initial?' · initial bundle':''}${b.rolled_back?' · undone':''}</small></div>${b.rolled_back?'':`<button data-undo="${esc(b.id)}">Undo import</button>`}</div>`).join('')||'<p>No imports yet.</p>'}</section>`;
 for(const id of ['namespace','vault-namespace']){
  const input=$('#'+id);try{input.value=sessionStorage.getItem('tumbleweed-import-'+id)||input.value;}catch{}
  input.oninput=()=>{try{sessionStorage.setItem('tumbleweed-import-'+id,input.value);}catch{}};
 }
 $('#backup-panel').onclick=downloadBackup;
 $('#preview-graph').onclick=async()=>{try{const f=$('#graph-file').files[0];if(!f)throw new Error('Choose graph.json first.');if(f.size>24*1024*1024)throw new Error('File exceeds 24 MB.');previewData=await api('/api/preview',{graph:JSON.parse(await f.text()),namespace:$('#namespace').value.trim()});showPreview();}catch(e){showImportError(e.message);}};
 $('#preview-markdown').onclick=async()=>{try{const files=[...$('#markdown-files').files];if(!files.length)throw new Error('Choose Markdown files or a ZIP first.');if(files.reduce((n,f)=>n+f.size,0)>16*1024*1024)throw new Error('Selected files exceed the 16 MB browser import limit.');let payload={namespace:$('#vault-namespace').value.trim()};if(files.length===1&&files[0].name.toLowerCase().endsWith('.zip')){const bytes=new Uint8Array(await files[0].arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));payload.zip=btoa(s);}else{if(files.some(f=>!f.name.toLowerCase().endsWith('.md')))throw new Error('Select Markdown files, or one ZIP by itself.');payload.files=await Promise.all(files.map(async f=>({path:f.webkitRelativePath||f.name,text:await f.text()})));}previewData=await api('/api/preview',payload);showPreview();}catch(e){showImportError(e.message);}};
 $('#restore').onclick=async()=>{try{const f=$('#restore-file').files[0];if(!f)throw new Error('Choose a backup first.');if(f.size>128*1024*1024)throw new Error('Backup exceeds the 128 MB workspace limit.');const backup=JSON.parse(await f.text());if(!backup||backup.format!=='tumbleweed-local-1')throw new Error('Not a Tumbleweed Local backup.');if(await confirmAction('Restore this workspace?',`This will replace the current workspace with ${Object.keys(backup.records||{}).length} records from the selected backup. The current version will be backed up on disk first.`)){await mutate({action:'restore',backup});toast('Backup restored. Previous workspace retained in data/backups.');}}catch(e){showImportError(e.message);}};
 $$('[data-undo]').forEach(b=>b.onclick=async()=>{if(await confirmAction('Undo this import?','Imported items from this batch will be reverted. Undo is blocked if newer edits or relationships depend on them. A backup is saved first.')){try{await mutate({action:'undo-import',id:b.dataset.undo});toast('Import undone.');}catch(e){showImportError(e.message);}}});
}
function showImportError(message){$('#import-preview').innerHTML=`<div class="error-banner" role="alert">${esc(message)}</div>`;}
function showPreview() {
 const p=previewData;$('#import-preview').innerHTML=`<section class="panel"><h2>Import preview: ${esc(p.namespace)}</h2><p>${p.records} records · ${p.sources} sources · ${p.edges} relationships</p><div class="notice">${p.new} new items · ${p.unchanged} unchanged · ${p.conflicts.length} conflicts. Existing local annotations are retained. Items absent from this import are not deleted.</div>${p.conflicts.map((c,i)=>`<div class="conflict"><label><input type="checkbox" data-conflict="${i}"> Accept incoming change for ${esc(c.after.title || c.id)}</label><details><summary>Compare source data</summary><div class="diff"><div><p>Current</p><pre class="raw">${esc(pretty(c.before))}</pre></div><div><p>Incoming</p><pre class="raw">${esc(pretty(c.after))}</pre></div></div></details></div>`).join('')}<p class="muted">Unchecked conflicts keep the current source data. No imported text will be executed.</p><button id="commit-import" class="primary">Import reviewed data</button></section>`;
 $('#commit-import').onclick=async()=>{const accepted=$$('[data-conflict]:checked').map(b=>({group:p.conflicts[Number(b.dataset.conflict)].group,id:p.conflicts[Number(b.dataset.conflict)].id}));try{await mutate({action:'import',token:p.token,accepted});previewData=null;toast('Import complete. Data and source references saved locally.');}catch(e){showImportError(e.message);}};
}
async function downloadBackup(){try{const backup=await api('/api/backup');const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tumbleweed-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Backup prepared for download.');}catch(e){toast(e.message);}}
function renderGuide() {
 $('#content').innerHTML=`<article class="panel guide"><h2>Start with one real project</h2><ol><li>Create a project and name its next concrete action.</li><li>Search the knowledge library for relevant experience. Read the claims and their source locators.</li><li>Connect a useful record to the project and write why it matters.</li><li>Before stopping, update “I stopped at,” “Next time, start with,” and “Before leaving, put away.”</li></ol><h2>Where your work lives</h2><p>The application runs on <code>127.0.0.1</code> and saves its workspace to <code>${esc(dataPath)}</code>. It uses your installed Python runtime and browser. It has no login, analytics, external fonts, AI API or remote storage.</p><p>Use <strong>Export backup</strong> to make a portable copy. The app also keeps previous versions in <code>data/backups</code>. Copy the whole Tumbleweed folder to move the application; keep the data folder. A local backup protects against editing mistakes, not loss of the disk itself.</p><h2>Evidence, inference and unknowns</h2><ul><li><strong>Retrieved summary:</strong> not a complete transcript. Titles and derived record IDs may not be canonical chat IDs.</li><li><strong>Metadata only:</strong> supports a file’s existence or type, not claims about its contents.</li><li><strong>Reported decision:</strong> historical evidence of a decision, not automatic current acceptance.</li><li><strong>Proposal:</strong> not a confirmed decision. Open questions remain open.</li><li><strong>Inferred relationship:</strong> an association whose rationale you can inspect. Shared topics do not prove dependency.</li></ul><h2>Import without losing context</h2><p>Stable IDs, original fields, source locators, claim status and relationship evidence are retained. Original imported data is read-only in the editor; your notes are separate annotations.</p><p>Imports use a namespace plus the original ID. Reusing that namespace makes reimport repeatable. Changed source data is offered for review; your edits are preserved. Missing items are retained. Import history supports undo, but protects newer work from being erased.</p><p>The application starts empty. Only records you capture or explicitly import become part of your collection.</p><h2>Obsidian import boundaries</h2><p>Select reviewed Markdown notes, or a ZIP containing them. Full text and paths are preserved. Wikilinks and Markdown .md links can become explicit “links to” relationships when the target is unambiguous. Basic inline frontmatter tags and aliases are recognized. Other frontmatter remains in the original text. Ambiguous or missing links remain unresolved in the bundle metadata below.</p><p>Import is one-way. Binary attachments, embedded images, automatic vault synchronization and original ChatGPT transcript retrieval are not implemented. Imported commands and HTML are displayed as text and never executed.</p><h2>Coverage & unresolved links</h2>${Object.entries(state.bundles).map(([ns,b])=>`<details class="evidence-box"><summary>${esc(ns)}</summary><pre>${esc(pretty(b))}</pre></details>`).join('')}<h2>Implementation boundary</h2><p>Tumbleweed is a local application built with the Python standard library and browser JavaScript. It has no bundled personal dataset, hosted account, or external AI service.</p></article>`;
}
$$('button[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));$('#capture').onclick=()=>edit();$('#reload').onclick=load;$('#backup').onclick=downloadBackup;bindClose();
$('#menu-toggle').onclick=()=>{const open=$('.sidebar').classList.toggle('mobile-open');$('#menu-toggle').setAttribute('aria-expanded',String(open));};
let searchTimer;
function applyFilters(){clearTimeout(searchTimer);page=1;Specimen.recordPage=1;rememberFilters();render();}
$('#search').addEventListener('input',e=>{clearTimeout(searchTimer);if(!e.isComposing)searchTimer=setTimeout(applyFilters,140);});
$('#search').addEventListener('compositionstart',()=>clearTimeout(searchTimer));
$('#search').addEventListener('compositionend',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(applyFilters,140);});
for(const id of ['collection','sort','topic','coverage','from-date','to-date','archived'])$('#'+id).addEventListener('change',applyFilters);
$('#clear-filters').onclick=()=>{clearTimeout(searchTimer);Specimen.recordPage=1;for(const id of ['search','collection','topic','coverage','from-date','to-date'])$('#'+id).value='';$('#archived').checked=false;page=1;rememberFilters();render();};
initSpecimen();
$('#filter-toggle').onclick=()=>{const open=$('.toolbar').classList.toggle('expanded');$('#filter-toggle').setAttribute('aria-expanded',String(open));};
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
view=location.hash.slice(1) in viewInfo?location.hash.slice(1):'graph';load();

document.addEventListener('click',e=>{const b=e.target.closest('[data-collection]');if(b){$('#collection').value=b.dataset.collection;rememberFilters();navigate('knowledge');}});
function messageReader(r){
 const messages=r.raw?.messages||[];
 if(!messages.length)return r.coverage==='retrieved_summary'?'<section class="detail-section"><h3>Conversation availability</h3><p class="muted">Only a retrieved summary was supplied. The original conversation messages are not in this record.</p></section>':'';
 return `<section class="detail-section"><h3>Preserved messages <span class="muted">(${messages.length})</span></h3><p class="muted">Supplied excerpts in source order. Missing messages have not been reconstructed.</p>${messages.map(m=>`<article class="message ${m.role==='user'?'user-message':''}"><header><strong>${esc(m.role==='user'?'You':label(m.role))}</strong><time>${esc(m.timestamp?new Date(m.timestamp).toLocaleString():'Time unavailable')}</time></header><div class="prose">${esc(m.text)}</div><details><summary>Message source & attachments</summary><pre>${esc(pretty({id:m.id,locator:m.source_locator,attachments:m.attachments}))}</pre></details></article>`).join('')}</section>`;
}
function renderReview(){
 const rows=records(),a=Catalog.audit(rows,Object.values(state.edges));
 $('#content').innerHTML=`<div class="review-stats"><section class="panel"><strong>${a.records}</strong><p>records preserved</p></section><section class="panel"><strong>${a.renamed}</strong><p>custom display titles</p></section><section class="panel"><strong>${a.messages}</strong><p>messages in ${a.message_records} records</p></section><section class="panel"><strong>${a.summaries}</strong><p>summary-only conversations</p></section></div><section class="panel"><h2>What the cleanup changes</h2><p>Your chosen titles and collections control navigation. Topics are normalized for matching. Without a collection, the first normalized topic supplies a branch; untagged records use a general category. Edit a record to choose a different collection.</p><p>Original titles, text, claims, identifiers and relationships remain available inside each record and in your complete backup. A collection is an organizational suggestion, not evidence of a relationship.</p></section><section class="panel"><h2>Copies worth inspecting</h2><p>The source identifies ${a.duplicate_pairs.length} pair with identical extracted text. Separate source identities and differing metadata are retained.</p>${a.duplicate_pairs.map(e=>`<div class="evidence-box"><button data-open="${esc(e.from)}">${esc(get(e.from).title)}</button> <button data-open="${esc(e.to)}">${esc(get(e.to).title)}</button><p>${esc(e.rationale)}</p></div>`).join('')}</section><section class="panel"><h2>Remaining evidence gaps</h2><p>${a.open_questions} source claims are explicitly open questions. Summaries cannot recover missing conversation wording. Review each record’s coverage and source before relying on its contents.</p><p>Historical proposals and reported decisions have not been promoted to current commitments. Inspect the source before relying on a consequential claim.</p></section><div class="section-heading"><h2>Browse by collection</h2></div><div class="collection-shortcuts">${a.collections.map(c=>`<button data-collection="${esc(c)}">${esc(c)} · ${rows.filter(r=>r.collection===c).length}</button>`).join('')}</div>`;
 bindRecords($('#content'));
}
const modalDrafts=new Set();
for(const id of ['link-dialog','gather-dialog']){
 const dialog=$('#'+id);
 dialog.addEventListener('input',()=>modalDrafts.add(id));
 dialog.addEventListener('change',()=>modalDrafts.add(id));
 dialog.addEventListener('close',()=>modalDrafts.delete(id));
 const discard=async()=>{if(await confirmAction('Discard unsaved edits?','Choose Cancel to keep editing. Saved records and gathered selections are retained.'))dialog.close();};
 dialog.addEventListener('cancel',e=>{if(saveBusy){e.preventDefault();return;}if(modalDrafts.has(id)){e.preventDefault();discard();}});
 document.addEventListener('click',e=>{if(e.target.closest('[data-close="'+id+'"]')&&modalDrafts.has(id)){e.preventDefault();e.stopImmediatePropagation();discard();}},true);
}
let editorDirty=false;
$('#edit-form').addEventListener('input',()=>editorDirty=true);
$('#editor').addEventListener('close',()=>editorDirty=false);
async function discardDraft(){if(await confirmAction('Discard unsaved edits?','Your saved record will stay unchanged. Choose Cancel to keep editing this draft.'))$('#editor').close();}
$('#editor').addEventListener('cancel',e=>{if(saveBusy){e.preventDefault();return;}if(editorDirty){e.preventDefault();discardDraft();}});
document.addEventListener('click',e=>{if(e.target.closest('[data-close="editor"]')&&editorDirty){e.preventDefault();e.stopImmediatePropagation();discardDraft();}},true);
window.addEventListener('beforeunload',e=>{if(editorDirty||modalDrafts.size||taskDrafts.size||saveBusy){e.preventDefault();e.returnValue='';}});

function rememberFilters(){try{sessionStorage.setItem('tumbleweed-filters',JSON.stringify(Object.fromEntries(['search','collection','sort','topic','coverage','from-date','to-date','archived'].map(id=>[id,id==='archived'?$('#'+id).checked:$('#'+id).value]))));}catch{}}
function restoreFilters(){try{const prefs=JSON.parse(sessionStorage.getItem('tumbleweed-filters')||'{}');for(const [id,value] of Object.entries(prefs)){const el=document.getElementById(id);if(el&&['INPUT','SELECT'].includes(el.tagName)){if(id==='archived')el.checked=value===true;else el.value=value;}}if(!$('#sort').value)$('#sort').value='title';}catch{}}

let activeProject=null;
const taskDrafts=new Map();
function renderWorkshop(projects){
 const p=projects.find(p=>p.id===activeProject)||projects[0];activeProject=p?.id||null;
 $('#title').textContent=p?p.title:'Your projects';
 $('#eyebrow').textContent='PROJECT';
 $('#subtitle').textContent='';
 if(!p){$('#content').innerHTML=`<section class="workshop-empty"><div class="seed-drawing" aria-hidden="true">✳</div><div><div class="margin-label">START WITH KNOWLEDGE</div><h2>Gather. Then make.</h2><p>Gather records from a branch, or begin a project here.</p><button class="primary" id="workshop-new">+ Begin a project</button><button id="workshop-browse">Explore knowledge</button></div></section>`;$('#workshop-new').onclick=()=>edit(null,'project');$('#workshop-browse').onclick=()=>navigate('graph');return;}
 const links=Object.values(state.edges).filter(e=>e.from===p.id||e.to===p.id),linked=links.map(e=>({edge:e,r:get(e.from===p.id?e.to:e.from)})).filter(x=>x.r);
 const linkedIds=new Set(linked.map(x=>x.r.id)),topics=new Set(p.topics||[]);
 const suggestions=records().filter(r=>r.id!==p.id&&!r.archived&&!linkedIds.has(r.id)).map(r=>({r,shared:(r.topics||[]).filter(t=>topics.has(t))})).filter(x=>x.shared.length).sort((a,b)=>b.shared.length-a.shared.length).slice(0,5);
 const tasks=p.tasks||[],done=tasks.filter(t=>t.done).length;
 $('#content').innerHTML=`<div class="project-switcher"><label>Working on <select id="workshop-project">${projects.map(r=>`<option value="${esc(r.id)}" ${r.id===p.id?'selected':''}>${esc(r.title)}</option>`).join('')}</select></label><span class="status">${esc(p.status||'planned')}</span><button id="workshop-new">+ New project</button><button id="workshop-edit">Edit goal & next step</button><button id="workshop-archive">Archive</button></div><section class="worktable"><article class="work-paper purpose-paper"><div class="margin-label">01 / THE INTENTION</div><h2>Intention</h2><div class="prose">${esc(p.summary||'Describe the outcome you want. Edit this project to make its purpose concrete.')}</div><div class="tags">${(p.topics||[]).map(t=>`<span class="tag">${esc(Catalog.topicLabel(t))}</span>`).join('')}</div><div class="resume-slip"><small>NEXT TIME, START WITH</small><p>${esc(p.next_action||'Choose one concrete action.')}</p><small>I STOPPED AT</small><p>${esc(p.stopped_at||'Not recorded yet.')}</p><small>BEFORE LEAVING, PUT AWAY</small><p>${esc(p.put_away||'Not recorded yet.')}</p></div></article><article class="work-paper task-paper"><div class="margin-label">02 / THE WORK</div><h2>Next steps <small>${done}/${tasks.length}</small></h2><div class="progress"><span style="width:${tasks.length?done/tasks.length*100:0}%"></span></div><div class="tasks">${tasks.map((t,i)=>`<label class="${t.done?'done':''}"><input type="checkbox" data-work-task="${i}" ${t.done?'checked':''}>${esc(t.text)}</label>`).join('')||'<p class="muted">Add the first small step below.</p>'}</div><form id="quick-task"><label class="sr-only" for="task-text">New task</label><input id="task-text" name="text" placeholder="A small, concrete step…" maxlength="1000" required><button class="primary">Add step</button></form><p class="work-error" role="alert"></p></article><article class="work-paper evidence-paper"><div class="margin-label">03 / THE REASONS</div><h2>Evidence</h2><p class="muted">${linked.length} attached ${linked.length===1?'record':'records'}</p>${linked.map(({r,edge})=>`<div class="pinned-evidence"><small>${esc(label(edge.relation))} · ${esc(edge.basis)}</small><button data-open="${esc(r.id)}">${esc(r.title)} ↗</button><p>${esc(short(edge.rationale,180))}</p></div>`).join('')||'<p class="margin-note">Attach a useful note, earlier attempt, or source. Record why it matters.</p>'}<button id="workshop-connect">+ Attach knowledge</button><details class="possible-evidence"><summary>Possible connections (${suggestions.length})</summary><p class="muted">Shared topics suggest relevance; you decide whether to connect them.</p>${suggestions.map(({r,shared})=>`<div class="pinned-evidence"><button data-open="${esc(r.id)}">${esc(r.title)} ↗</button><small>Shared: ${esc(shared.map(Catalog.topicLabel).join(', '))}</small><button data-attach="${esc(r.id)}">Review connection</button></div>`).join('')||'<p>Add topics to this project to find related knowledge.</p>'}</details></article></section>`;
 $('#workshop-project').onchange=e=>{activeProject=e.target.value;$('#detail').close();render();};
 $('#workshop-new').onclick=()=>edit(null,'project');$('#workshop-edit').onclick=()=>edit(p.id);
 $('#workshop-connect').onclick=()=>link(null,p.id);
 $('#workshop-archive').onclick=async()=>{if(await confirmAction('Archive this project?','Its notes, tasks and evidence connections will be retained. You can restore it from the reading view using Include archived.'))try{await mutate({action:'archive-record',id:p.id,archived:true});}catch(e){toast(e.message);}};
 $$('[data-attach]').forEach(b=>b.onclick=()=>link(b.dataset.attach,p.id));
 $$('[data-work-task]').forEach(b=>b.onchange=async()=>{const updated=structuredClone(tasks);updated[Number(b.dataset.workTask)].done=b.checked;try{await mutate({action:'save-record',record:{...p,tasks:updated}});if(view==='projects'&&activeProject===p.id)$('[data-work-task="'+b.dataset.workTask+'"]')?.focus({preventScroll:true});}catch(e){b.checked=!b.checked;toast(e.message);}});
 $('#task-text').value=taskDrafts.get(p.id)||'';
 $('#task-text').oninput=e=>{if(e.target.value)taskDrafts.set(p.id,e.target.value);else taskDrafts.delete(p.id);};
 $('#quick-task').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,input=$('#task-text',form),draft=input.value,text=draft.trim();if(!text)return;
  const button=$('button',form),errorBox=$('.work-error');button.disabled=true;form.inert=true;
  // Keep the draft until the server confirms success; navigation may replace this form.
  taskDrafts.set(p.id,draft);
  try{
   await mutate({action:'save-record',record:{...p,tasks:[...tasks,{text,done:false}]}});
   if(taskDrafts.get(p.id)===draft){taskDrafts.delete(p.id);if(view==='projects'&&activeProject===p.id){const current=$('#task-text');if(current?.value===draft)current.value='';}}
   if(view==='projects'&&activeProject===p.id)$('#task-text')?.focus({preventScroll:true});
  }catch(err){if(form.isConnected&&errorBox?.isConnected)errorBox.textContent=err.message;else toast('Step not saved. Your draft is kept with this project. '+err.message);}
  finally{button.disabled=false;form.inert=false;}
 };

}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog:modal'))$('#detail').close();if(e.key==='/'&&!document.activeElement.isContentEditable&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();if($('.toolbar').hidden)navigate('knowledge');$('#search').focus();}});
