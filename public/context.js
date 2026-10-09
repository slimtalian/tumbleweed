'use strict';
const TumbleweedContext=(()=>{
 function neighbors(id,edges,lookup){
  return Object.values(edges).filter(e=>e.from===id||e.to===id).map(e=>({edge:e,record:lookup(e.from===id?e.to:e.from),direction:e.from===id?'outgoing':'incoming'})).filter(x=>x.record).sort((a,b)=>Number(a.record.archived)-Number(b.record.archived)||Number(a.edge.basis==='inferred')-Number(b.edge.basis==='inferred')||a.record.title.localeCompare(b.record.title));
 }
 function parseTasks(text,previous=[]){
  const lines=text.split('\n').filter(t=>t.trim()).map(line=>({text:line.replace(/^\[x\]\s*/i,'').trim(),done:/^\[x\]/i.test(line)}));
  const used=new Set(),matches=lines.map(line=>{const index=previous.findIndex((t,i)=>!used.has(i)&&t.text===line.text);if(index>=0)used.add(index);return index;});
  return lines.map((line,i)=>{let index=matches[i];if(index<0&&lines.length===previous.length&&!used.has(i)){index=i;used.add(i);}return {...(index<0?{}:previous[index]),...line};});
 }
 function decisionState(r){return r.imported?'Historical reference':({active:'Accepted',planned:'Proposed',paused:'Revisit',completed:'Superseded'})[r.status]||'Unclassified';}
 return {neighbors,parseTasks,decisionState};
})();
if(typeof module!=='undefined')module.exports=TumbleweedContext;
