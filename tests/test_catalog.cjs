const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const catalog=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/catalog.js'),'utf8')+'\nCatalog');

test('unfamiliar imported titles remain intact without personal remapping',()=>{
 const raw={title:'PLANS.md',kind:'artifact',topics:['Gardening'],coverage:'local_markdown'};
 const result=catalog.decorate({...raw,raw,imported:true,namespace:'a-vault'});
 assert.equal(result.title,'PLANS.md');assert.equal(result.source_title,'PLANS.md');
 assert.equal(result.collection,'gardening');assert.equal(result.evidence_label,'Imported note');
 assert.equal(result.curated,false);
});
test('an explicit collection and local display title take precedence',()=>{
 const raw={title:'Source title',topics:['work'],kind:'note'};
 const result=catalog.decorate({...raw,raw,imported:true,annotations:{title:'My label',collection:'My shelf'}});
 assert.equal(result.title,'My label');assert.equal(result.source_title,'Source title');
 assert.equal(result.collection,'My shelf');assert.equal(raw.title,'Source title');
});
test('a new empty collection has no inherited content or branches',()=>{
 const audit=catalog.audit([],[]);
 assert.equal(audit.records,0);assert.equal(audit.collections.length,0);
 assert.equal(catalog.decorate({title:'First note',kind:'note',topics:[]}).collection,'Notes');
});
