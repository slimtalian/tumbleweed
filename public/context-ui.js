'use strict';
// Context stays attached to existing records; the specimen remains the home view.
$('#edit-form footer').insertAdjacentHTML('beforebegin',`<section class="decision-fields" hidden><h3>Keep the reason with the choice</h3><label>Why this choice?<textarea name="decision_rationale" rows="3" maxlength="4000"></textarea></label><label>Alternatives considered<textarea name="decision_alternatives" rows="2" maxlength="4000"></textarea></label><label>Review on<input name="decision_review_on" type="date"></label><p class="muted">Proposed is not accepted. Choose the status deliberately; original historical decisions remain reference material.</p></section>`);
const baseProjectFields=showProjectFields;
showProjectFields=function(){baseProjectFields();const form=$('#edit-form'),decision=form.elements.kind.value==='decision'&&!form.elements.kind.disabled;$('.decision-fields').hidden=!decision;
 for(const field of ['decision_rationale','decision_alternatives','decision_review_on'])form.elements[field].disabled=!decision;
 const labels=decision?['Unclassified','Proposed','Accepted','Revisit','Superseded']:['Reference','Planned','Active','Paused','Completed'];[...form.elements.status.options].forEach((o,i)=>o.textContent=labels[i]);
};
const baseEdit=edit;
edit=function(id=null,kind='note',origin=null){baseEdit(id,kind,origin);const r=id?get(id):{},form=$('#edit-form');for(const field of ['decision_rationale','decision_alternatives','decision_review_on'])form.elements[field].value=r[field]||'';if(!id&&kind==='decision'&&origin)form.elements.title.value='Decision: '+origin.title;};

const baseOpenRecord=openRecord;
openRecord=function(id,back=false){baseOpenRecord(id,back);const r=get(id);if(!r||!$('#detail').open)return;
 const nearby=TumbleweedContext.neighbors(id,state.edges,get),trail=[...recordTrail,id].slice(-7);
 const panel=document.createElement('section');panel.className='context-neighborhood';
 panel.innerHTML=`<nav class="thought-trail" aria-label="Reading trail">${trail.map((key,i)=>`<button data-trail="${esc(key)}" ${i===trail.length-1?'aria-current="page"':''}>${esc(short(get(key)?.title||'Unavailable',45))}</button>`).join('<span aria-hidden="true">→</span>')}</nav><details><summary>Nearby thoughts · ${nearby.length}</summary><div class="thought-neighbors">${nearby.slice(0,16).map(({edge,record,direction})=>`<button data-neighbor="${esc(record.id)}"><small>${direction==='outgoing'?'↗':'↙'} ${esc(label(edge.relation))} · ${esc(edge.basis)}${record.archived?' · archived':''}</small><strong>${esc(record.title)}</strong><span>${esc(short(edge.rationale,120))}</span></button>`).join('')||'<p class="muted">A connection begins with a reason.</p>'}</div>${nearby.length>16?'<p class="muted">The full list is in Relationships & backlinks below.</p>':''}</details>`;
 $('.detail-actions',$('#detail')).after(panel);
 $$('[data-neighbor]',panel).forEach(b=>b.onclick=()=>openRecord(b.dataset.neighbor));
 $$('[data-trail]',panel).forEach(b=>b.onclick=()=>{const index=recordTrail.indexOf(b.dataset.trail);if(index>=0){recordTrail=recordTrail.slice(0,index);openRecord(b.dataset.trail,true);}});
 if(r.kind==='decision'){
  const context=document.createElement('section');context.className='decision-context';context.innerHTML=`<small>${esc(TumbleweedContext.decisionState(r))}${!r.imported?' · '+esc((r.created_at||'').slice(0,10)):''}</small>${!r.imported?`<h3>Why this choice?</h3><p>${esc(r.decision_rationale||'Reason not recorded yet.')}</p>${r.decision_alternatives?`<h3>Alternatives considered</h3><p>${esc(r.decision_alternatives)}</p>`:''}${r.decision_review_on?`<p class="muted">Review on ${esc(r.decision_review_on)} — a prompt to reconsider, not an automatic status change.</p>`:''}`:'<p>Reported in the original source. This does not establish a current commitment.</p>'}`;panel.after(context);
 }
 if(!r.archived){const choice=document.createElement('button');choice.textContent='Record a decision';choice.onclick=()=>edit(null,'decision',r);$('.detail-actions',$('#detail')).append(choice);
  if(r.kind!=='project'){const step=document.createElement('button');step.textContent='Use as a project step';step.onclick=()=>contextStep(r);$('.detail-actions',$('#detail')).append(step);}
 }
};

document.body.insertAdjacentHTML('beforeend',`<dialog id="context-step"><form id="context-step-form"><div class="dialog-head"><h2>A step with its context</h2><button type="button" data-close="context-step" aria-label="Close project step">×</button></div><p id="context-step-source" class="muted"></p><label>Project<select name="project" required></select></label><label>Next concrete step<input name="step" maxlength="1000" required></label><label>Why does this knowledge matter?<textarea name="reason" rows="3" maxlength="4000" required></textarea></label><p class="form-error" role="alert"></p><footer><button type="button" data-close="context-step">Cancel</button><button type="submit" class="primary">Add step with context</button></footer></form></dialog>`);
bindClose($('#context-step'));
function contextStep(source){
 const projects=records().filter(r=>!r.imported&&!r.archived&&r.kind==='project');if(!projects.length){toast('Begin a project or Gather this record into one first.');return;}
 const form=$('#context-step-form');form.reset();form.elements.project.innerHTML=projects.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');if(projects.some(p=>p.id===activeProject))form.elements.project.value=activeProject;
 $('#context-step-source').textContent='From: '+source.title;$('.form-error',form).textContent='';$('#context-step').showModal();
 form.onsubmit=async e=>{e.preventDefault();const p=get(form.elements.project.value),button=$('[type=submit]',form);button.disabled=true;form.inert=true;
  try{if(!p||p.archived||get(source.id)?.archived)throw new Error('The project or context is unavailable. Reload and review.');await mutate({action:'save-record',record:{...p,tasks:[...(p.tasks||[]),{text:form.elements.step.value.trim(),done:false,context_id:source.id,context_reason:form.elements.reason.value.trim()}]},origin:Object.values(state.edges).some(e=>(e.from===source.id&&e.to===p.id)||(e.to===source.id&&e.from===p.id))?null:source.id});$('#context-step').close();$('#detail').close();activeProject=p.id;navigate('projects');toast('Step saved with its source context.');}
  catch(error){$('.form-error',form).textContent=error.message;}finally{button.disabled=false;form.inert=false;}
 };
}
const baseWorkshop=renderWorkshop;
renderWorkshop=function(projects){baseWorkshop(projects);const p=get(activeProject);if(!p)return;
 $$('[data-work-task]').forEach(input=>{const task=p.tasks[Number(input.dataset.workTask)];if(!task.context_id)return;const source=get(task.context_id),button=document.createElement('button');button.className='task-context-link';button.type='button';button.textContent=source?'↗ '+short(source.title,65)+(source.archived?' · archived':''):'Context unavailable';button.disabled=!source;button.title=task.context_reason||'Read the original context';button.onclick=()=>openRecord(task.context_id);const context=document.createElement('div');context.className='task-context';context.append(button);if(task.context_reason){const reason=document.createElement('p');reason.className='muted';reason.textContent=task.context_reason;context.append(reason);}input.parentElement.after(context);});
};
// Include the new dialog in the existing unsaved-draft protection.
const stepDialog=$('#context-step');
stepDialog.addEventListener('input',()=>modalDrafts.add('context-step'));
stepDialog.addEventListener('close',()=>modalDrafts.delete('context-step'));
const discardStep=async()=>{if(await confirmAction('Discard this unfinished step?','Choose Cancel to keep its text and reason.'))stepDialog.close();};
stepDialog.addEventListener('cancel',e=>{if(saveBusy||modalDrafts.has('context-step')){e.preventDefault();if(!saveBusy)discardStep();}});
document.addEventListener('click',e=>{if(e.target.closest('[data-close="context-step"]')&&modalDrafts.has('context-step')){e.preventDefault();e.stopImmediatePropagation();if(!saveBusy)discardStep();}},true);

