'use strict';
// A selection is a local working set, never an evidence edge until Gather is saved.
const Specimen={picked:new Set(),allOpen:false,recordPage:1};
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
 $('#detail').close();clearSpecimenFilters();$('#collection').value=collection;Specimen.allOpen=false;Specimen.recordPage=1;rememberFilters();render();
 $('#thread-heading')?.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)$('#thread-heading')?.scrollIntoView({block:'start',behavior:'instant'});
}
function clearSpecimenFilters(){
 for(const id of ['search','collection','topic','coverage','from-date','to-date'])$('#'+id).value='';
 $('#archived').checked=false;
}
function closeThread(){
 $('#detail').close();Specimen.allOpen=false;Specimen.recordPage=1;clearSpecimenFilters();
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
 const nodes=all.filter(r=>!r.archived),groups=Catalog.audit(nodes,[]).collections;
 const hasFilters=['search','collection','topic','coverage','from-date','to-date'].some(id=>$('#'+id).value)||$('#archived').checked;
 const unfolded=hasFilters||Specimen.allOpen;
 const edges=Object.values(state.edges),name=$('#collection').value||($('#search').value?'Search results':'All knowledge');
 const size=16,total=Math.max(1,Math.ceil(list.length/size));Specimen.recordPage=Math.min(total,Specimen.recordPage);
 const visible=list.slice((Specimen.recordPage-1)*size,Specimen.recordPage*size);
 $('#content').innerHTML=`<section class="specimen-table ${unfolded?'unfolded':''}" aria-label="Tumbleweed specimen table">
  <div class="specimen-mark"><span>SAMPLE COLLECTION</span><small>${nodes.length} ${nodes.length===1?'record':'records'} · ${groups.length} ${groups.length===1?'branch':'branches'}</small></div>
  <div class="specimen-map"><div class="graph-stage"><canvas id="graph" aria-label="Tumbleweed. Use the branch buttons to unfold a collection."></canvas><div class="branch-handles">${groups.map((c,i)=>`<button class="branch-handle ${$('#collection').value===c?'chosen':''}" data-thread="${esc(c)}" aria-label="Open ${esc(c)} branch" aria-pressed="${$('#collection').value===c}"><span class="branch-pin"></span><span>${esc(c)}<small>${nodes.filter(r=>r.collection===c).length}</small></span></button>`).join('')}</div><div class="specimen-caption">${matchMedia('(max-width:760px)').matches?'Tap a branch. Follow a thought.':'Pull a branch. Follow a thought.'}</div></div>
  <div class="specimen-controls"><button id="specimen-all">Browse all</button><details class="map-tools"><summary>Map controls</summary><div class="map-tool-body"><div class="graph-controls"><button id="rotate-left" aria-label="Rotate left">↶</button><button id="rotate-right" aria-label="Rotate right">↷</button><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="graph-reset">Reset</button></div><select id="graph-focus" aria-label="Focus a record"><option value="">Focus a record…</option>${nodes.slice(0,1500).map(r=>`<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('')}</select><label><input id="graph-labels" type="checkbox"> Names</label><label><input id="graph-texture" type="checkbox" checked> Twigs</label>${nodes.length>1500?'<p>The map shows 1,500 records. Browse all or search to reach every record.</p>':''}<p>Drag to turn; release to coast. Two fingers turn, pinch to zoom, or twist to spin. Scroll over the map to zoom. Touch again to stop. Hold a node to highlight its connections. Scroll outside the map to move the page.</p><p>Twigs and branch stems group records. Bright paths are recorded connections; dashed paths are inferred.</p></div></details></div></div>
  ${unfolded?`<aside class="unfolded-thread" aria-label="Unfolded thread"><div class="thread-binding"></div><div class="thread-heading"><div><small>${list.length} ${list.length===1?'record':'records'}</small><h2 id="thread-heading" tabindex="-1">${esc(name)}</h2></div><button id="fold-thread" aria-label="Fold this thread">×</button></div><div class="specimen-records">${visible.map((r,i)=>`<article class="specimen-slip"><span class="slip-index">${String((Specimen.recordPage-1)*size+i+1).padStart(2,'0')}</span><button class="slip-read" data-open="${esc(r.id)}"><small>${esc(r.evidence_label)}</small><h3>${esc(r.title)}</h3><p>${esc(short(r.summary,135))}</p></button><button class="pick-record" data-pick="${esc(r.id)}" aria-pressed="false">+ Gather</button></article>`).join('')||'<p class="muted">No matching records.</p>'}</div>${total>1?`<div class="thread-pages"><button id="thread-prev" ${Specimen.recordPage===1?'disabled':''}>←</button><span>${Specimen.recordPage} / ${total}</span><button id="thread-next" ${Specimen.recordPage===total?'disabled':''}>→</button></div>`:''}</aside>`:''}
  <div class="project-bookmarks" aria-label="Project bookmarks">${projects.slice(-3).reverse().map(p=>`<button class="project-bookmark" data-open="${esc(p.id)}"><span>◈</span><div>${esc(p.title)}<small>${esc(p.next_action||'Choose a next step')}</small></div></button>`).join('')}</div>
 </section>`;
 $('#specimen-all').onclick=()=>{clearSpecimenFilters();Specimen.allOpen=true;Specimen.recordPage=1;rememberFilters();render();$('#thread-heading')?.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)$('#thread-heading')?.scrollIntoView({block:'start',behavior:'instant'});};
 if($('#fold-thread'))$('#fold-thread').onclick=closeThread;
 if($('#thread-prev')){$('#thread-prev').setAttribute('aria-label','Previous records');$('#thread-prev').onclick=()=>{Specimen.recordPage--;render();$('#thread-heading')?.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)$('#thread-heading')?.scrollIntoView({block:'start',behavior:'instant'});};}
 if($('#thread-next')){$('#thread-next').setAttribute('aria-label','Next records');$('#thread-next').onclick=()=>{Specimen.recordPage++;render();$('#thread-heading')?.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)$('#thread-heading')?.scrollIntoView({block:'start',behavior:'instant'});};}
 for(const b of $$('[data-thread]')){
  let start=null,pulled=false;
  b.onclick=()=>{if(!pulled)openThread(b.dataset.thread);pulled=false;};
  b.onpointerdown=e=>{if(e.button!==0||e.pointerType==='touch')return;start={x:e.clientX,y:e.clientY};pulled=false;b.setPointerCapture(e.pointerId);};
  b.onpointermove=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;b.style.setProperty('--pull-x',Math.max(-70,Math.min(70,dx))+'px');b.style.setProperty('--pull-y',Math.max(-70,Math.min(70,dy))+'px');if(Math.hypot(dx,dy)>50)pulled=true;};
  b.onpointerup=()=>{start=null;b.style.removeProperty('--pull-x');b.style.removeProperty('--pull-y');if(pulled)openThread(b.dataset.thread);};
  b.onpointercancel=()=>{start=null;pulled=false;b.style.removeProperty('--pull-x');b.style.removeProperty('--pull-y');};
 }
 graphCleanup=createTumbleweedGraph($('#graph'),nodes,edges,id=>{const r=get(id);if(r&&(r.imported||r.kind!=='project')&&!unfolded){openThread(r.collection);}openRecord(id);},{specimen:true,groups,collection:$('#collection').value,matches:hasFilters?new Set(list.map(r=>r.id)):null});
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
 document.body.insertAdjacentHTML('beforeend',`<div id="gather-bar" hidden><span id="gather-total"></span><button id="gather-clear" aria-label="Clear gathered selection">Clear</button><button id="gather-save">Gather into project ↗</button></div><dialog id="gather-dialog"><form id="gather-form"><div class="dialog-head"><h2>Gather into a project</h2><button type="button" data-close="gather-dialog" aria-label="Close gather">×</button></div><details class="gather-list"><summary>Selected knowledge</summary><ul id="gather-selection"></ul></details><label>Project<select name="project_id"></select></label><div id="gather-new-fields"><label>Name<input name="title" maxlength="500" required></label><label>Next step<input name="next_action" maxlength="4000"></label></div><label>Why these records?<textarea name="rationale" rows="3" maxlength="4000" required></textarea></label><p class="muted">Original records stay intact. Each connection keeps this reason.</p><div class="form-error" role="alert"></div><footer><button type="button" data-close="gather-dialog">Cancel</button><button class="primary" type="submit">Gather & open</button></footer></form></dialog>`);
 $('#gather-save').onclick=showGather;$('#gather-clear').onclick=()=>{Specimen.picked.clear();persistGather();updateGatherUI();};
 $$('[data-close="gather-dialog"]').forEach(b=>b.onclick=()=>$('#gather-dialog').close());
 document.addEventListener('click',e=>{const pick=e.target.closest('[data-pick]');if(pick)toggleGather(pick.dataset.pick);});
}
