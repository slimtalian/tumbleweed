const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../demo/store.js'),'utf8');
function harness(available=true){
 const requests=[],databases=[],saved={revision:9,records:{kept:{title:'Saved work'}}};
 const indexedDB={open(){const request={};requests.push(request);return request;}};
 const ctx={location:{pathname:'/tumbleweed/'},window:{indexedDB:available?indexedDB:null},indexedDB,structuredClone,
 TumbleweedDemoSeed:{revision:0,records:{}},TumbleweedDemoModel:{mutate:(state)=>({...state,revision:state.revision+1})}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const api=vm.runInContext('TumbleweedDemo',ctx);
 function succeed(request=requests.at(-1)){
  const db={closed:false,close(){this.closed=true;},createObjectStore(){},transaction(){
   if(this.closed)throw new Error('Closed connection used');
   const tx={objectStore:()=>({get(){const query={};queueMicrotask(()=>{query.result=structuredClone(saved);query.onsuccess();tx.oncomplete();});return query;},put(){}})};return tx;
  }};databases.push(db);request.result=db;request.onsuccess();return db;
 }
 return {api,requests,databases,saved,succeed};
}
test('version change releases the old connection and reopens saved data',async()=>{
 const h=harness(),first=h.api.request('/api/state');const db=h.succeed();assert.equal((await first).state.revision,9);
 db.onversionchange();assert.equal(db.closed,true);
 const next=h.api.request('/api/state');assert.equal(h.requests.length,2);h.succeed();assert.equal((await next).state.revision,9);assert.equal(h.api.sessionOnly,false);
});
test('unexpected connection closure permits a subsequent reconnect',async()=>{
 const h=harness(),first=h.api.request('/api/state');const db=h.succeed();await first;
 db.closed=true;db.onclose();const next=h.api.request('/api/backup');h.succeed();assert.equal((await next).records.kept.title,'Saved work');
});
test('blocked open rejects without substituting samples and closes a late connection',async()=>{
 const h=harness(),first=h.api.request('/api/state');const old=h.requests[0];old.onblocked();
 await assert.rejects(first,/storage is busy/);assert.equal(h.api.sessionOnly,false);
 const late=h.succeed(old);assert.equal(late.closed,true);
 const retry=h.api.request('/api/state');h.succeed();assert.equal((await retry).state.revision,9);
});
test('transient opening errors remain errors and can be retried',async()=>{
 const h=harness(),first=h.api.request('/api/state');h.requests[0].error=new Error('Disk unavailable');h.requests[0].onerror();
 await assert.rejects(first,/Disk unavailable/);assert.equal(h.api.sessionOnly,false);
 const retry=h.api.request('/api/state');h.succeed();assert.equal((await retry).state.revision,9);
});
test('missing browser storage offers explicitly labelled session-only operation',async()=>{
 const h=harness(false);assert.equal((await h.api.request('/api/state')).state.revision,0);assert.equal(h.api.sessionOnly,true);
 await h.api.request('/api/mutate',{});assert.equal((await h.api.request('/api/backup')).revision,1);
 assert.match(h.api.savedLabel(1),/Session only/);
});
test('a later permission error cannot replace an already opened workspace with samples',async()=>{
 const h=harness(),first=h.api.request('/api/state');const db=h.succeed();await first;db.onversionchange();
 const next=h.api.request('/api/state');h.requests.at(-1).error={name:'SecurityError',message:'Denied'};h.requests.at(-1).onerror();
 await assert.rejects(next,/Denied/);assert.equal(h.api.sessionOnly,false);
});
