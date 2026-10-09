const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const root=path.join(__dirname,'..');
const context=vm.createContext({structuredClone,crypto,TextEncoder});
vm.runInContext(fs.readFileSync(path.join(root,'demo/model.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'docs/demo-data.js'),'utf8'),context);
const model=vm.runInContext('TumbleweedDemoModel',context);
const seed=vm.runInContext('TumbleweedDemoSeed',context);
const change=(state,request)=>model.mutate(state,{revision:state.revision,...request},seed);

test('the fictional collection is valid, connected, and has six real project examples',()=>{
 model.validate(seed);assert.equal(Object.keys(seed.records).length,48);
 assert.equal(Object.values(seed.records).filter(r=>!r.imported&&r.kind==='project').length,6);
 assert.equal(new Set(Object.values(seed.records).map(r=>r.raw?.collection||r.collection)).size,6);
 assert.ok(Object.values(seed.edges).some(e=>e.basis==='inferred'));
 assert.ok(Object.values(seed.edges).some(e=>e.basis==='explicit'));
 assert.ok(Object.values(seed.sources).every(s=>s.raw.verified_url===null&&s.raw.locator.sample===true));
});
test('capture and task completion do not mutate the seed or source evidence',()=>{
 const before=JSON.stringify(seed);const initial=change(seed,{action:'save-record',record:{kind:'project',title:'My trial',tasks:[{text:'Inspect',done:false}]}});
 const project=Object.values(initial.records).find(r=>r.title==='My trial');
 const saved=change(initial,{action:'save-record',record:{...project,tasks:[{text:'Inspect',done:true}]}});
 assert.equal(saved.records[project.id].tasks[0].done,true);assert.equal(saved.revision,2);assert.equal(JSON.stringify(seed),before);
 assert.deepEqual(saved.sources,initial.sources);
});
test('annotations preserve the original record and claims',()=>{
 const id='sample::branch-0-note-0';const saved=change(seed,{action:'save-record',record:{id,title:'My label',summary:'A local reflection'}});
 assert.equal(JSON.stringify(saved.records[id].raw),JSON.stringify(seed.records[id].raw));assert.equal(saved.records[id].annotations.title,'My label');
});
test('gather is atomic, rejects archived records, and adds each connection once',()=>{
 const ids=['sample::branch-0-note-0','sample::branch-0-note-1'];const before=JSON.stringify(seed);
 const saved=change(seed,{action:'gather',ids,title:'New garden trial',rationale:'Compare these observations',next_action:'Sketch a test'});
 const project=Object.values(saved.records).find(r=>r.title==='New garden trial');
 assert.equal(Object.values(saved.edges).filter(e=>e.to===project.id).length,2);
 const again=change(saved,{action:'gather',ids,project_id:project.id,rationale:'Compare these observations'});assert.equal(again.revision,saved.revision);
 const archived=change(seed,{action:'archive-record',id:ids[0],archived:true});
 assert.throws(()=>change(archived,{action:'gather',ids,title:'Invalid',rationale:'Context'}),/available/);
 assert.equal(JSON.stringify(seed),before);
});
test('relationships require a reason, reject duplicates, and retain imported evidence',()=>{
 const edge={from:'sample::branch-0-note-0',to:'local::project-1',relation:'supports',basis:'inferred',rationale:'Compare the observations'};
 assert.throws(()=>change(seed,{action:'link',edge:{...edge,rationale:''}}),/required/);
 const saved=change(seed,{action:'link',edge});assert.throws(()=>change(saved,{action:'link',edge}),/already exists/);
 const own=Object.values(saved.edges).find(e=>!seed.edges[e.id]);const removed=change(saved,{action:'unlink',id:own.id});assert.equal(removed.edges[own.id],undefined);
 assert.throws(()=>change(seed,{action:'unlink',id:'sample::branch-0-link-0'}),/retained/);
});
test('stale windows cannot overwrite a newer saved revision',()=>{
 const next=change(seed,{action:'save-record',record:{kind:'note',title:'New note'}});
 assert.throws(()=>model.mutate(next,{revision:0,action:'archive-record',id:'local::project-0',archived:true},seed),/another window/);
});
test('bad restore cannot introduce broken references or sensitive source records',()=>{
 const broken=structuredClone(seed);broken.edges['sample::branch-0-link-0'].to='missing';
 assert.throws(()=>change(seed,{action:'restore',backup:broken}),/endpoints/);
 const sensitive=structuredClone(seed);sensitive.records['sample::branch-0-note-0'].raw.sensitivity='sensitive';
 assert.throws(()=>change(seed,{action:'restore',backup:sensitive}),/imported/);
 const source=structuredClone(seed);source.sources['sample::source-branch-0-note-0'].raw.title=[];
 assert.throws(()=>change(seed,{action:'restore',backup:source}),/source/);
});
test('backup round-trip and reset preserve monotonic revisions',()=>{
 const next=change(seed,{action:'save-record',record:{kind:'note',title:'A demo edit'}});
 const restored=change(next,{action:'restore',backup:JSON.parse(JSON.stringify(seed))});assert.equal(restored.revision,2);
 const reset=change(next,{action:'reset-demo'});assert.equal(reset.revision,2);assert.equal(Object.keys(reset.records).length,48);
});
test('oversized demo workspaces are rejected before commit',()=>{
 const before=JSON.stringify(seed);assert.throws(()=>change(seed,{action:'save-record',record:{kind:'note',title:'Huge',summary:'x'.repeat(8*1024*1024)}}),/8 MB/);assert.equal(JSON.stringify(seed),before);
});
test('Pages assets work under a repository subpath and use only local scripts',()=>{
 const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
 assert.ok(!/\b(?:src|href)="(?:\/|\.\.\/)/.test(html));assert.ok(html.includes('./demo-store.js'));
 for(const [,asset] of html.matchAll(/\b(?:src|href)="\.\/([^"]+)"/g)){
  const [name,version]=asset.split('?v=');assert.ok(fs.existsSync(path.join(root,'docs',name)),asset);
  assert.equal(version,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'docs',name))).digest('hex').slice(0,12));
 }
 for(const css of ['style.css','specimen.css','demo.css'])assert.ok(!/url\(['"]?\//.test(fs.readFileSync(path.join(root,'docs',css),'utf8')));
 assert.ok(fs.existsSync(path.join(root,'docs/.nojekyll')));
});
