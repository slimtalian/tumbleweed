'use strict';
// Pure workspace operations shared by the Pages adapter and its tests.
const TumbleweedDemoModel=(()=>{
 const copy=value=>structuredClone(value);
 const require=(ok,message)=>{if(!ok)throw new Error(message);};
 const stamp=()=>new Date().toISOString();
 const uid=prefix=>prefix+crypto.randomUUID();
 const kinds=new Set(['project','note','experience','resource','decision']);
 const fields=['title','summary','topics','kind','status','next_action','stopped_at','put_away','tasks','url','collection','decision_rationale','decision_alternatives','decision_review_on'];
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 function display(value){
  require(object(value),'Invalid record or annotations.');
  for(const field of fields.filter(key=>!['topics','tasks'].includes(key)))require(value[field]===undefined||typeof value[field]==='string',field+' must be text.');
  require(value.topics===undefined||Array.isArray(value.topics)&&value.topics.every(t=>typeof t==='string'),'Topics must be text.');
  require(!value.decision_review_on||/^\d{4}-\d{2}-\d{2}$/.test(value.decision_review_on)&&new Date(value.decision_review_on+'T00:00:00Z').toISOString().slice(0,10)===value.decision_review_on,'Decision review date must be YYYY-MM-DD.');
  require(value.tasks===undefined||Array.isArray(value.tasks)&&value.tasks.every(t=>object(t)&&typeof t.text==='string'&&typeof t.done==='boolean'),'Invalid tasks.');
  for(const task of value.tasks||[])require(task.context_id===undefined||typeof task.context_id==='string','Task context must be a record ID.');
  for(const task of value.tasks||[])require(task.context_reason===undefined||typeof task.context_reason==='string','Task context reason must be text.');
  require(value.archived===undefined||typeof value.archived==='boolean','Archived must be true or false.');
 }
 function validate(state){
  require(object(state)&&state.format==='tumbleweed-local-1','Choose a Tumbleweed workspace backup.');
  require(Number.isSafeInteger(state.revision)&&state.revision>=0,'Invalid revision.');
  for(const group of ['records','sources','edges']){
   require(object(state[group])&&Object.keys(state[group]).length<=6000,'Too many or invalid '+group+'.');
   for(const [id,item] of Object.entries(state[group]))require(object(item)&&item.id===id,'Invalid '+group+' identity.');
  }
  for(const r of Object.values(state.records)){
   if(r.imported){
    require(typeof r.namespace==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(r.namespace)&&!['local','local-edge'].includes(r.namespace),'Invalid source namespace.');
    require(object(r.raw)&&typeof r.raw.id==='string'&&r.id===r.namespace+'::'+r.raw.id&&r.external_id===r.raw.id,'Imported identity was changed.');
    require(r.raw.sensitivity==='general'&&typeof r.raw.title==='string','Invalid imported source record.');
    display(r.raw);display(r.annotations||{});
    require(Array.isArray(r.raw.source_ids||[])&&(r.raw.source_ids||[]).every(id=>typeof id==='string'&&state.sources[r.namespace+'::'+id]),'Missing source reference.');
    require(Array.isArray(r.raw.claims||[])&&(r.raw.claims||[]).every(c=>object(c)&&typeof c.text==='string'&&typeof c.status==='string'&&Array.isArray(c.source_ids||[])&&(c.source_ids||[]).every(id=>state.sources[r.namespace+'::'+id])),'Invalid source claim.');
    require(Array.isArray(r.raw.messages||[])&&(r.raw.messages||[]).every(m=>object(m)&&typeof m.text==='string'&&typeof m.role==='string'),'Invalid preserved messages.');
   }else{display(r);require(typeof r.title==='string'&&r.title.trim()&&kinds.has(r.kind),'Invalid local record.');}
  }
  for(const r of Object.values(state.records))for(const task of (r.imported?r.annotations?.tasks:r.tasks)||[])if(task.context_id)require(state.records[task.context_id],'Missing task context record.');
  for(const s of Object.values(state.sources))require(object(s.raw)&&s.raw.sensitivity==='general'&&typeof s.raw.title==='string'&&s.id===s.namespace+'::'+s.raw.id&&s.external_id===s.raw.id,'Invalid preserved source.');
  for(const e of Object.values(state.edges)){
   require(state.records[e.from]&&state.records[e.to]&&e.from!==e.to,'Relationship has missing or identical endpoints.');
   require(typeof e.relation==='string'&&e.relation.trim()&&['explicit','inferred'].includes(e.basis)&&typeof e.rationale==='string','Invalid relationship evidence.');
   if(e.namespace)require(object(e.raw)&&e.id===e.namespace+'::'+e.raw.id&&e.external_id===e.raw.id&&e.from===e.namespace+'::'+e.raw.from&&e.to===e.namespace+'::'+e.raw.to&&e.relation===e.raw.relation&&e.basis===(e.raw.basis||'inferred')&&e.rationale===(e.raw.rationale||''),'Imported relationship evidence was changed.');
  }
  require(Array.isArray(state.batches)&&object(state.bundles),'Invalid import history.');
  require(new TextEncoder().encode(JSON.stringify(state)).length<=8*1024*1024,'This demo supports workspaces up to 8 MB. Export your collection and use the local app for more material.');
  return state;
 }
 const visible=r=>({...r.raw,...r,...r.annotations});
 const available=r=>r&&!visible(r).archived;
 function edge(state,from,to,rationale,relation='informs',basis='explicit'){
  require(from!==to&&state.records[from]&&state.records[to],'Choose two different available records.');
  if(Object.values(state.edges).some(e=>e.from===from&&e.to===to&&e.relation===relation))return false;
  const id=uid('local-edge::');state.edges[id]={id,from,to,relation,basis,rationale,created_at:stamp()};return true;
 }
 function mutate(previous,request,seed){
  require(object(request)&&request.revision===previous.revision,'Workspace changed in another window. Reload before saving.');
  let next=copy(previous);
  switch(request.action){
   case 'save-record':{
    const r=request.record;require(object(r),'Record must be an object.');
    require(typeof r.title==='string'&&r.title.trim()&&r.title.length<=500,'A title of up to 500 characters is required.');
    require(!r.id||typeof r.id==='string'&&next.records[r.id],'This record no longer exists. Reload before editing.');
    const id=r.id||uid('local::'),old=next.records[id],allowed=Object.fromEntries(fields.filter(key=>r[key]!==undefined).map(key=>[key,copy(r[key])]));
    display(allowed);
    if(old?.imported){next.records[id].annotations={...old.annotations,...allowed,updated_at:stamp()};}
    else{require(kinds.has(allowed.kind),'Choose a valid record kind.');next.records[id]={...old,...allowed,id,imported:false,created_at:old?.created_at||stamp(),updated_at:stamp()};}
    if(request.origin){require(available(next.records[request.origin]),'The original context is unavailable.');edge(next,request.origin,id,'Selected as context when creating this record.');}
    break;
   }
   case 'archive-record':{
    const r=next.records[request.id];require(r,'The record is unavailable.');require(typeof request.archived==='boolean','Choose archive or restore.');
    if(r.imported)r.annotations={...r.annotations,archived:request.archived};else r.archived=request.archived;
    break;
   }
   case 'link':{
    const e=request.edge;require(object(e),'Invalid relationship.');
    require(typeof e.relation==='string'&&e.relation.trim()&&typeof e.rationale==='string'&&e.rationale.trim()&&['explicit','inferred'].includes(e.basis),'A relationship type, basis and reason are required.');
    require(edge(next,e.from,e.to,e.rationale.trim(),e.relation,e.basis),'This relationship already exists.');break;
   }
   case 'unlink':require(next.edges[request.id]&&!next.edges[request.id].namespace,'Imported evidence is retained.');delete next.edges[request.id];break;
   case 'gather':{
    require(Array.isArray(request.ids)&&request.ids.length>0&&request.ids.length<=100&&request.ids.every(id=>typeof id==='string'&&available(next.records[id])),'Choose 1–100 available records.');
    require(typeof request.rationale==='string'&&request.rationale.trim()&&request.rationale.length<=4000,'Explain why these records belong with this project.');
    const ids=[...new Set(request.ids)];let id=request.project_id;
    if(id)require(available(next.records[id])&&next.records[id].kind==='project'&&!next.records[id].imported,'Choose an available local project.');
    else{
     require(typeof request.title==='string'&&request.title.trim()&&request.title.length<=500,'Name the project.');
     require(request.next_action===undefined||typeof request.next_action==='string','Next step must be text.');
     id=uid('local::');const topics=[...new Set(ids.flatMap(key=>visible(next.records[key]).topics||[]))].sort();
     next.records[id]={id,imported:false,kind:'project',title:request.title.trim(),summary:'',topics,status:'planned',tasks:[],next_action:(request.next_action||'').trim(),created_at:stamp(),updated_at:stamp()};
    }
    require(!ids.includes(id),'A project cannot be gathered into itself.');
    ids.forEach(key=>edge(next,key,id,request.rationale.trim()));break;
   }
   case 'restore':next=copy(validate(request.backup));next.revision=previous.revision;break;
   case 'reset-demo':require(seed,'Sample data is unavailable.');next=copy(validate(seed));next.revision=previous.revision;break;
   default:throw new Error('This feature is available in the local application.');
  }
  validate(next);
  if(JSON.stringify(next)!==JSON.stringify(previous))next.revision=previous.revision+1;
  return next;
 }
 return {validate,mutate};
})();
if(typeof module!=='undefined')module.exports=TumbleweedDemoModel;
