const {test}=require('node:test');
const assert=require('node:assert/strict');
const context=require('../public/context.js');
test('direct neighbors retain direction and evidence basis, excluding missing endpoints',()=>{
 const records={a:{title:'A',archived:false},b:{title:'B',archived:false},c:{title:'C',archived:true}};
 const edges=[{from:'root',to:'b',basis:'inferred'},{from:'a',to:'root',basis:'explicit'},{from:'root',to:'c',basis:'explicit'},{from:'root',to:'missing'}];
 const near=context.neighbors('root',edges,id=>records[id]);
 assert.deepEqual(near.map(x=>x.record.title),['A','B','C']);assert.equal(near[0].direction,'incoming');assert.equal(near[1].edge.basis,'inferred');
});
test('task edit, completion, and reorder retain source context without duplication',()=>{
 const previous=[{text:'Observe',done:false,context_id:'source',context_reason:'Check conditions'},{text:'Sketch',done:false}];
 let tasks=context.parseTasks('Sketch\n[x] Observe',previous);assert.equal(tasks[1].context_id,'source');assert.equal(tasks[1].done,true);
 tasks=context.parseTasks('Observe carefully\nSketch',previous);assert.equal(tasks[0].context_reason,'Check conditions');
 tasks=context.parseTasks('Observe\nObserve',previous);assert.equal(tasks.filter(t=>t.context_id).length,1);
});
test('historical decisions never become accepted current commitments',()=>{
 assert.equal(context.decisionState({imported:true,status:'active'}),'Historical reference');assert.equal(context.decisionState({status:'planned'}),'Proposed');assert.equal(context.decisionState({status:'active'}),'Accepted');
});
