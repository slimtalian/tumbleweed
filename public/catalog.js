'use strict';
// Generic presentation rules. Original imported text and identities stay intact.
const Catalog = (() => {
 function topics(values){return [...new Set((values||[]).map(t=>t.trim().toLowerCase()).filter(Boolean))].sort();}
 const topicLabel=t=>t.replaceAll('-',' ');
 function collection(r){
  const first=topics(r.topics)[0];
  if(first)return topicLabel(first);
  return r.kind==='project'?'Projects':r.kind==='resource'?'Resources':'Notes';
 }
 function evidence(r){
  if(!r.imported)return 'Local note';
  if(r.coverage==='local_markdown')return 'Imported note';
  if(r.coverage==='direct_visible_messages')return 'Message excerpts';
  if(r.coverage==='retrieved_summary')return 'Retrieved summary';
  if(r.coverage==='metadata_only')return 'Metadata only';
  return /partial/i.test(r.read_scope||'')?'Partial file inspection':'File summary';
 }
 function decorate(r){
  const original=r.raw||r,user=r.annotations||{};
  return {...r,title:user.title||r.title,source_title:original.title,topics:topics(r.topics),
   collection:user.collection||r.collection||collection(r),evidence_label:evidence(r),
   curated:!!user.title&&user.title!==original.title};
 }
 function audit(rows,edges){
  return {records:rows.length,renamed:rows.filter(r=>r.curated).length,
   messages:rows.reduce((n,r)=>n+(r.raw?.messages||[]).length,0),
   message_records:rows.filter(r=>r.raw?.messages?.length).length,
   summaries:rows.filter(r=>r.coverage==='retrieved_summary').length,
   collections:[...new Set(rows.map(r=>r.collection))].sort(),
   duplicate_pairs:edges.filter(e=>e.relation==='identical_extracted_text'),
   open_questions:rows.reduce((n,r)=>n+(r.raw?.claims||[]).filter(c=>c.status==='open_question').length,0)};
 }
 return {decorate,topics,topicLabel,audit,version:1};
})();
