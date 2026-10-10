const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
function projectFixture(storage=new Map(),dataPath='workspace-a'){
 const ctx={activeProject:null,dataPath,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function selectWorkshopProject('),source.indexOf('function renderWorkshop(')),ctx);
 return ctx;
}
test('project selection survives reload and explicit selection wins',()=>{
 const storage=new Map(),projects=[{id:'a'},{id:'b'}],first=projectFixture(storage);
 first.activeProject='b';assert.equal(first.selectWorkshopProject(projects).id,'b');
 const reloaded=projectFixture(storage);assert.equal(reloaded.selectWorkshopProject(projects).id,'b');
 reloaded.activeProject='a';assert.equal(reloaded.selectWorkshopProject(projects).id,'a');
});
test('missing projects fall back and empty workspaces clear stale selection',()=>{
 const storage=new Map([['tumbleweed-project:workspace-a','archived']]),ctx=projectFixture(storage);
 assert.equal(ctx.selectWorkshopProject([{id:'available'}]).id,'available');
 assert.equal(storage.get('tumbleweed-project:workspace-a'),'available');
 assert.equal(ctx.selectWorkshopProject([]),undefined);assert.equal(storage.has('tumbleweed-project:workspace-a'),false);
});
test('project preference is scoped by workspace and unavailable storage cannot break rendering',()=>{
 const ctx=projectFixture(new Map([['tumbleweed-project:workspace-b','b']]));
 assert.equal(ctx.selectWorkshopProject([{id:'a'},{id:'b'}]).id,'a');
 ctx.activeProject=null;ctx.sessionStorage={getItem(){throw Error('Denied');},setItem(){throw Error('Denied');}};
 assert.equal(ctx.selectWorkshopProject([{id:'b'}]).id,'b');
});
function fixture(){
 let resolve,reject;
 const pending=new Promise((a,b)=>{resolve=a;reject=b;});
 const input={value:'Keep this step',focus(){}},button={disabled:false},form={isConnected:true,inert:false};
 const error={isConnected:true,textContent:''},drafts=new Map(),messages=[];
 const ctx={p:{id:'project'},tasks:[],taskDrafts:drafts,view:'projects',activeProject:'project',mutate:()=>pending,toast:m=>messages.push(m),$:selector=>({'#quick-task':form,'#task-text':input,'button':button,'.work-error':error})[selector]};
 vm.createContext(ctx);
 const begin=source.indexOf(" $('#quick-task').onsubmit=");
 const end=source.indexOf('\n}',begin);
 vm.runInContext(source.slice(begin,end),ctx);
 return {ctx,input,button,form,error,drafts,messages,resolve,reject,submit:()=>form.onsubmit({preventDefault(){},currentTarget:form})};
}
test('navigation during a rejected task save keeps draft and reports error without missing DOM access',async()=>{
 const f=fixture(),save=f.submit();assert.equal(f.drafts.get('project'),'Keep this step');
 f.form.isConnected=false;f.error.isConnected=false;f.ctx.view='graph';f.ctx.$=()=>null;
 f.reject(new Error('Offline'));await save;
 assert.equal(f.drafts.get('project'),'Keep this step');assert.match(f.messages[0],/Offline/);assert.equal(f.form.inert,false);
});
test('successful task save clears only the submitted draft',async()=>{
 const f=fixture(),save=f.submit();f.resolve();await save;
 assert.equal(f.drafts.has('project'),false);assert.equal(f.input.value,'');assert.equal(f.button.disabled,false);
});
test('newer text entered after navigation survives an earlier successful save',async()=>{
 const f=fixture(),save=f.submit();f.drafts.set('project','A newer step');f.input.value='A newer step';f.resolve();await save;
 assert.equal(f.drafts.get('project'),'A newer step');assert.equal(f.input.value,'A newer step');
});
test('a visible failed form stays editable and retains its error',async()=>{
 const f=fixture(),save=f.submit();f.reject(new Error('Conflict'));await save;
 assert.equal(f.error.textContent,'Conflict');assert.equal(f.form.inert,false);assert.equal(f.input.value,'Keep this step');
});
test('a second confirmation cannot replace or inherit the first approval',async()=>{
 const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;}},nodes={'#confirm-dialog':dialog,'#confirm-title':{},'#confirm-text':{},'#confirm-yes':{},'#confirm-no':{}};
 const ctx={$:id=>nodes[id]};vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('function confirmAction('),source.indexOf('function bindClose(')),ctx);
 const first=ctx.confirmAction('First','Original');assert.equal(await ctx.confirmAction('Second','Different'),false);
 assert.equal(nodes['#confirm-title'].textContent,'First');nodes['#confirm-yes'].onclick();assert.equal(await first,true);
});
test('an import error remains visible after navigating away from imports',()=>{
 const messages=[],ctx={$:()=>null,toast:m=>messages.push(m)};vm.createContext(ctx);
 const start=source.indexOf('function showImportError('),end=source.indexOf('\n',start);
 vm.runInContext(source.slice(start,end),ctx);ctx.showImportError('Import failed');
 assert.equal(messages[0],'Import failed');
});
