'use strict';
// A selection is a local working set, never an evidence edge until Gather is saved.
const Specimen={picked:new Set(),allOpen:false,recordPage:1,group:'',cameras:new Map(),cameraKey:null};
try{const stored=JSON.parse(sessionStorage.getItem('tumbleweed-gather')||'[]');if(Array.isArray(stored))for(const id of stored)if(typeof id==='string')Specimen.picked.add(id);}catch{}
function persistGather(){try{sessionStorage.setItem('tumbleweed-gather',JSON.stringify([...Specimen.picked]));}catch{}}
function toggleGather(id){
 if(Specimen.picked.has(id))Specimen.picked.delete(id);else {if(Specimen.picked.size>=100){toast('Gather up to 100 records at a time.');return;}Specimen.picked.add(id);}
 persistGather();updateGatherUI();
}
function updateGatherUI(){
 if(state)for(const id of Specimen.picked)if(!get(id)||get(id).archived)Specimen.picked.delete(id);
 persistGather();
 $$('[data-pick]').forEach(b=>{const picked=Specimen.picked.has(b.dataset.pick);b.setAttribute('aria-pressed',String(picked));b.textContent=picked?'✓ Gathered':'+ Gather';});
 const bar=$('#gather-bar');if(bar){bar.hidden=!Specimen.picked.size;$('#gather-total').textContent=Specimen.picked.size+' gathered';}
}
function openThread(collection){
 $('#detail').close();Specimen.group='';clearSpecimenFilters();$('#collection').value=collection;Specimen.allOpen=false;Specimen.recordPage=1;rememberFilters();render();
 focusWeedLocation();
}
function clearSpecimenFilters(){
 for(const id of ['search','collection','topic','coverage','from-date','to-date'])$('#'+id).value='';
 $('#archived').checked=false;
}
function closeThread(){
 $('#detail').close();Specimen.group='';Specimen.allOpen=false;Specimen.recordPage=1;clearSpecimenFilters();
 rememberFilters();render();$('#specimen-all')?.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)window.scrollTo({top:0,behavior:'instant'});
}
function renderSpecimen(all,list,projects){
 for(const id of Specimen.picked)if(!get(id)||get(id).archived)Specimen.picked.delete(id);
 persistGather();
 if(!all.length){
  $('#content').innerHTML=`<section class="workshop-empty collection-empty"><div class="seed-drawing" aria-hidden="true"></div><div><div class="margin-label">A PLACE TO BEGIN</div><h2>Let a thought take root.</h2><p>Capture your first note, or bring in your Markdown files.</p><button class="primary" id="empty-capture">+ Capture a note</button><button id="empty-import">Import Markdown</button></div></section>`;
  $('.toolbar').hidden=true;
  $('#empty-capture').onclick=()=>edit();$('#empty-import').onclick=()=>navigate('imports');
  updateGatherUI();return;
 }
 if(Specimen.workspace!==dataPath){Specimen.workspace=dataPath;Specimen.group='';Specimen.cameraKey=null;Specimen.cameras.clear();try{Specimen.group=sessionStorage.getItem('tumbleweed-group:'+dataPath)||'';}catch{}}
 const allNodes=all.filter(r=>!r.archived),collection=$('#collection').value,topic=$('#topic').value;
 const customNames=[...new Set(all.flatMap(r=>r.groups||[]))].sort((a,b)=>a.localeCompare(b));
 if(Specimen.group&&!customNames.includes(Specimen.group))Specimen.group='';
 try{sessionStorage.setItem('tumbleweed-group:'+dataPath,Specimen.group);}catch{}
 const scoped=!!(collection||topic||Specimen.group);
 const nodes=allNodes.filter(r=>(!collection||r.collection===collection)&&(!topic||(r.topics||[]).includes(topic))&&(!Specimen.group||(r.groups||[]).includes(Specimen.group)));
 if(Specimen.group)list=list.filter(r=>(r.groups||[]).includes(Specimen.group));
 const topics=[...new Set(nodes.flatMap(r=>r.topics||[]))].sort((a,b)=>a.localeCompare(b));
 const groups=scoped?(topic?[]:topics):Catalog.audit(nodes,[]).collections;
 const mapNodes=scoped?nodes.map(r=>({...r,collection:(r.topics||[]).find(t=>groups.includes(t))||''})):nodes;
 const cameraKey=JSON.stringify([collection,topic,Specimen.group]);
 const scopeChanged=Specimen.cameraKey!==null&&Specimen.cameraKey!==cameraKey;
 const parentName=topic?(Specimen.group||collection||'All knowledge'):'All knowledge';
 if(Specimen.cameraKey!==cameraKey){if(Specimen.cameraKey!==null)Specimen.cameras.set(Specimen.cameraKey,graphCamera);graphCamera=Specimen.cameras.get(cameraKey)||null;Specimen.cameraKey=cameraKey;}
 const hasFilters=['search','collection','topic','coverage','from-date','to-date'].some(id=>$('#'+id).value)||$('#archived').checked;
 const unfolded=hasFilters||Specimen.allOpen||scoped;
 const edges=Object.values(state.edges),name=topic?Catalog.topicLabel(topic):Specimen.group||collection||($('#search').value?'Search results':'All knowledge');
 const size=16,total=Math.max(1,Math.ceil(list.length/size));Specimen.recordPage=Math.min(total,Specimen.recordPage);
 const visible=list.slice((Specimen.recordPage-1)*size,Specimen.recordPage*size);
 $('#content').innerHTML=`<nav class="weed-path" tabindex="-1" aria-label="Tumbleweed location"><button id="weed-home" ${!scoped?'aria-current="page"':''}>All knowledge</button>${collection?`<span>›</span><button id="weed-parent">${esc(collection)}</button>`:''}${Specimen.group?`<span>›</span><button id="weed-group-parent">${esc(Specimen.group)}</button>`:''}${topic?`<span>›</span><span aria-current="page">${esc(Catalog.topicLabel(topic))}</span>`:''}<button id="new-weed-group">+ Your group</button>${Specimen.group?'<button id="edit-weed-group">Edit group</button>':''}</nav>
 <div class="weed-groups">${customNames.length?`<details><summary>Your groups · ${customNames.length}</summary><div>${customNames.map(c=>`<button data-custom-group="${esc(c)}">${esc(c)} <small>${allNodes.filter(r=>(r.groups||[]).includes(c)).length}</small></button>`).join('')}</div></details>`:''}<details><summary>From topics · ${topics.length}</summary><div>${topics.map(t=>`<button data-auto-topic="${esc(t)}">${esc(Catalog.topicLabel(t))}</button>`).join('')||'<span>Add topics to your records to find automatic groupings.</span>'}</div></details></div>
 <section class="specimen-table ${unfolded?'unfolded':''}" aria-label="Tumbleweed specimen table">
  <div class="specimen-mark"><span>${scoped?'WITHIN '+esc(name):'SAMPLE COLLECTION'}</span><small>${nodes.length} ${nodes.length===1?'record':'records'} · ${groups.length} ${groups.length===1?'branch':'branches'}</small></div>
  <div class="specimen-map ${scopeChanged?'weed-arriving':''}"><div class="graph-stage"><canvas id="graph" aria-label="${scoped?'Focused tumbleweed: '+esc(name):'Tumbleweed. Use the branch buttons to enter a collection.'}"></canvas><div class="branch-handles">${groups.map((c,i)=>`<button class="branch-handle ${$('#collection').value===c?'chosen':''}" data-thread="${esc(c)}" aria-label="Open ${esc(c)} branch" aria-pressed="${$('#collection').value===c}"><span class="branch-pin"></span><span>${esc(scoped?Catalog.topicLabel(c):c)}<small>${nodes.filter(r=>scoped?(r.topics||[]).includes(c):r.collection===c).length}</small></span></button>`).join('')}</div><div class="specimen-caption">${matchMedia('(max-width:760px)').matches?'Tap a branch. Follow a thought.':'Pull a branch. Follow a thought.'}</div></div>
  <div class="specimen-controls"><button id="specimen-all">Browse all</button><details class="map-tools"><summary>Map controls</summary><div class="map-tool-body"><div class="graph-controls"><button id="rotate-left" aria-label="Rotate left">↶</button><button id="rotate-right" aria-label="Rotate right">↷</button><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="graph-reset">Reset</button></div><select id="graph-focus" aria-label="Focus a record"><option value="">Focus a record…</option>${nodes.slice(0,1500).map(r=>`<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('')}</select><label><input id="graph-labels" type="checkbox"> Names</label><label><input id="graph-texture" type="checkbox" checked> Twigs</label>${nodes.length>1500?'<p>The map shows 1,500 records. Browse all or search to reach every record.</p>':''}<p>Drag to turn; release to coast. Two fingers move the map, pinch to zoom, or twist to spin. Reset recentres it. Scroll over the map to zoom. Touch again to stop. Hold a node to highlight its connections. Scroll outside the map to move the page.</p><p>Twigs and branch stems group records. Bright paths are recorded connections; dashed paths are inferred.</p></div></details></div></div>
  ${unfolded?`<aside class="unfolded-thread" aria-label="Unfolded thread"><div class="thread-binding"></div><div class="thread-heading"><div><small>${list.length} ${list.length===1?'record':'records'}</small><h2 id="thread-heading" tabindex="-1">${esc(name)}</h2></div><button id="fold-thread" aria-label="Fold this thread">×</button></div><div class="specimen-records">${visible.map((r,i)=>`<article class="specimen-slip"><span class="slip-index">${String((Specimen.recordPage-1)*size+i+1).padStart(2,'0')}</span><button class="slip-read" data-open="${esc(r.id)}"><small>${esc(r.evidence_label)}</small><h3>${esc(r.title)}</h3><p>${esc(short(r.summary,135))}</p></button><button class="pick-record" data-pick="${esc(r.id)}" aria-pressed="false">+ Gather</button></article>`).join('')||'<p class="muted">No matching records.</p>'}</div>${total>1?`<div class="thread-pages"><button id="thread-prev" ${Specimen.recordPage===1?'disabled':''}>←</button><span>${Specimen.recordPage} / ${total}</span><button id="thread-next" ${Specimen.recordPage===total?'disabled':''}>→</button></div>`:''}</aside>`:''}
  <div class="project-bookmarks" aria-label="Project bookmarks">${projects.slice(-3).reverse().map(p=>`<button class="project-bookmark" data-open="${esc(p.id)}"><span>◈</span><div>${esc(p.title)}<small>${esc(p.next_action||'Choose a next step')}</small></div></button>`).join('')}</div>
 </section>`;
 const goBack=()=>{if(topic&&Specimen.group)openCustomGroup(Specimen.group);else if(topic&&collection)openThread(collection);else closeThread();};
 if($('#weed-back'))$('#weed-back').onclick=goBack;
 const map=$('.specimen-map'),finishArrival=()=>map.classList.remove('weed-arriving');
 for(const event of ['pointerdown','wheel','keydown'])map.addEventListener(event,finishArrival,{once:true,capture:true});
 $('#weed-home').onclick=closeThread;
 if($('#weed-parent'))$('#weed-parent').onclick=()=>openThread(collection);
 if($('#weed-group-parent'))$('#weed-group-parent').onclick=()=>openCustomGroup(Specimen.group);
 $('#new-weed-group').onclick=()=>showGroupEditor();
 if($('#edit-weed-group'))$('#edit-weed-group').onclick=()=>showGroupEditor(Specimen.group);
 $$('[data-custom-group]').forEach(b=>b.onclick=()=>openCustomGroup(b.dataset.customGroup));
 $$('[data-auto-topic]').forEach(b=>b.onclick=()=>openTopic(b.dataset.autoTopic));
 $('#specimen-all').onclick=()=>{Specimen.group='';clearSpecimenFilters();Specimen.allOpen=true;Specimen.recordPage=1;rememberFilters();render();$('#thread-heading')?.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)$('#thread-heading')?.scrollIntoView({block:'start',behavior:'instant'});};
 if($('#fold-thread')){$('#fold-thread').onclick=goBack;$('#fold-thread').setAttribute('aria-label',scoped?'Back to '+parentName:'Close records');}
 if($('#thread-prev')){$('#thread-prev').setAttribute('aria-label','Previous records');$('#thread-prev').onclick=()=>{Specimen.recordPage--;render();$('#thread-heading')?.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)$('#thread-heading')?.scrollIntoView({block:'start',behavior:'instant'});};}
 if($('#thread-next')){$('#thread-next').setAttribute('aria-label','Next records');$('#thread-next').onclick=()=>{Specimen.recordPage++;render();$('#thread-heading')?.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)$('#thread-heading')?.scrollIntoView({block:'start',behavior:'instant'});};}
 for(const b of $$('[data-thread]')){
  let start=null,pulled=false;
  b.onclick=()=>{if(!pulled)(scoped?openTopic:openThread)(b.dataset.thread);pulled=false;};
  b.onpointerdown=e=>{if(e.button!==0||e.pointerType==='touch')return;start={x:e.clientX,y:e.clientY};pulled=false;b.setPointerCapture(e.pointerId);};
  b.onpointermove=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;b.style.setProperty('--pull-x',Math.max(-70,Math.min(70,dx))+'px');b.style.setProperty('--pull-y',Math.max(-70,Math.min(70,dy))+'px');if(Math.hypot(dx,dy)>50)pulled=true;};
  b.onpointerup=()=>{start=null;b.style.removeProperty('--pull-x');b.style.removeProperty('--pull-y');if(pulled)(scoped?openTopic:openThread)(b.dataset.thread);};
  b.onpointercancel=()=>{start=null;pulled=false;b.style.removeProperty('--pull-x');b.style.removeProperty('--pull-y');};
 }
 graphCleanup=createTumbleweedGraph($('#graph'),mapNodes,edges,id=>{const r=get(id);if(r&&(r.imported||r.kind!=='project')&&!unfolded){openThread(r.collection);}openRecord(id);},{specimen:true,groups,collection:$('#collection').value,matches:hasFilters?new Set(list.map(r=>r.id)):null});
 updateGatherUI();
}
function showGather(){
 const ids=[...Specimen.picked].filter(id=>get(id)&&!get(id).archived);if(!ids.length){toast('Gather a record first.');return;}
 const projects=records().filter(r=>r.kind==='project'&&!r.imported&&!r.archived&&!ids.includes(r.id));
 const form=$('#gather-form');form.reset();
 $('#gather-selection').innerHTML=ids.map(id=>`<li>${esc(get(id).title)}</li>`).join('');
 form.elements.project_id.innerHTML='<option value="">New project</option>'+projects.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
 const toggle=()=>{$('#gather-new-fields').hidden=!!form.elements.project_id.value;form.elements.title.required=!form.elements.project_id.value;};
 form.elements.project_id.onchange=toggle;toggle();$('.form-error',form).textContent='';$('#gather-dialog').showModal();
 form.onsubmit=async e=>{e.preventDefault();const submit=$('button[type=submit]',form);submit.disabled=true;form.inert=true;const before=new Set(Object.keys(state.records));
  try{const payload=Object.fromEntries(new FormData(form));await mutate({action:'gather',ids,...payload});const id=payload.project_id||Object.keys(state.records).find(id=>!before.has(id));ids.forEach(id=>Specimen.picked.delete(id));persistGather();updateGatherUI();$('#gather-dialog').close();activeProject=id;openRecord(id);toast('Knowledge gathered into your project.');}
  catch(err){showSaveError(form,err);}
  finally{submit.disabled=false;form.inert=false;}
 };
}
function initSpecimen(){
 document.body.insertAdjacentHTML('beforeend',`<dialog id="group-dialog"><form id="group-form"><div class="dialog-head"><h2>Your tumbleweed</h2><button type="button" data-close="group-dialog" aria-label="Close group editor">×</button></div><label>Group name<input name="name" maxlength="100" required></label><p class="muted">Choose 1–1,000 records. A record can belong to several groups.</p><label>Find records<input name="find" type="search" placeholder="Title or collection"></label><p id="group-selection-count" role="status"></p><div id="group-members"></div><div class="group-pagination"><button type="button" id="group-prev" aria-label="Previous records">←</button><span id="group-page"></span><button type="button" id="group-next" aria-label="Next records">→</button></div><p class="form-error" role="alert"></p><footer><button type="button" data-close="group-dialog">Cancel</button><button type="submit" class="primary">Save group</button></footer></form></dialog>`);
 $$('[data-close="group-dialog"]').forEach(b=>b.onclick=()=>$('#group-dialog').close());

 document.body.insertAdjacentHTML('beforeend',`<div id="gather-bar" hidden><span id="gather-total"></span><button id="gather-clear" aria-label="Clear gathered selection">Clear</button><button id="gather-save">Gather into project ↗</button></div><dialog id="gather-dialog"><form id="gather-form"><div class="dialog-head"><h2>Gather into a project</h2><button type="button" data-close="gather-dialog" aria-label="Close gather">×</button></div><details class="gather-list"><summary>Selected knowledge</summary><ul id="gather-selection"></ul></details><label>Project<select name="project_id"></select></label><div id="gather-new-fields"><label>Name<input name="title" maxlength="500" required></label><label>Next step<input name="next_action" maxlength="4000"></label></div><label>Why these records?<textarea name="rationale" rows="3" maxlength="4000" required></textarea></label><p class="muted">Original records stay intact. Each connection keeps this reason.</p><div class="form-error" role="alert"></div><footer><button type="button" data-close="gather-dialog">Cancel</button><button class="primary" type="submit">Gather & open</button></footer></form></dialog>`);
 $('#gather-save').onclick=showGather;$('#gather-clear').onclick=()=>{Specimen.picked.clear();persistGather();updateGatherUI();};
 $$('[data-close="gather-dialog"]').forEach(b=>b.onclick=()=>$('#gather-dialog').close());
 document.addEventListener('click',e=>{const pick=e.target.closest('[data-pick]');if(pick)toggleGather(pick.dataset.pick);});
}

function openTopic(topic){$('#detail').close();$('#topic').value=topic;Specimen.recordPage=1;rememberFilters();render();focusWeedLocation();}
function openCustomGroup(name){clearSpecimenFilters();Specimen.group=name;Specimen.recordPage=1;rememberFilters();render();focusWeedLocation();}
function showGroupEditor(oldName=''){
 const dialog=$('#group-dialog'),form=$('#group-form');form.reset();$('.form-error',form).textContent='';
 const rows=records().sort((a,b)=>a.title.localeCompare(b.title));
 const chosen=new Set(oldName?rows.filter(r=>(r.groups||[]).includes(oldName)).map(r=>r.id):[...Specimen.picked]);
 form.elements.name.value=oldName;let page=0;
 const draw=()=>{
  const query=form.elements.find.value.toLowerCase().trim(),matches=rows.filter(r=>(r.title+' '+r.collection).toLowerCase().includes(query));
  const pages=Math.max(1,Math.ceil(matches.length/40));page=Math.min(page,pages-1);
  $('#group-members').innerHTML=matches.slice(page*40,(page+1)*40).map(r=>`<label><input type="checkbox" data-member="${esc(r.id)}" ${chosen.has(r.id)?'checked':''}><span>${esc(r.title)}<small>${esc(r.collection)}${r.archived?' · archived':''}</small></span></label>`).join('')||'<p>No matching records.</p>';
  $('#group-selection-count').textContent=chosen.size+' selected';$('#group-page').textContent=(page+1)+' / '+pages;
  $('#group-prev').disabled=page===0;$('#group-next').disabled=page===pages-1;
  $$('[data-member]',form).forEach(box=>box.onchange=()=>{if(box.checked)chosen.add(box.dataset.member);else chosen.delete(box.dataset.member);$('#group-selection-count').textContent=chosen.size+' selected';});
 };
 form.elements.find.oninput=()=>{page=0;draw();};$('#group-prev').onclick=()=>{page--;draw();};$('#group-next').onclick=()=>{page++;draw();};draw();
 form.onsubmit=async e=>{e.preventDefault();const name=form.elements.name.value.trim();form.inert=true;
  try{await mutate({action:'save-group',name,old_name:oldName,ids:[...chosen]});dialog.close();openCustomGroup(name);toast('Group saved. Original records and connections are unchanged.');}
  catch(error){showSaveError(form,error);}finally{form.inert=false;}
 };dialog.showModal();form.elements.name.focus();
}

function focusWeedLocation(){
 const location=$('.weed-path');location?.focus({preventScroll:true});
 if(matchMedia('(max-width:760px)').matches)location?.scrollIntoView({block:'start',behavior:'instant'});
}
