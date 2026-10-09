const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../public/graph.js'),'utf8');
function setup(){
 let draws=0,serial=0,resize,opened=0,cleanup;const frames=new Map(),controls=new Map();
 const context=new Proxy({clearRect(){draws++},measureText(){return {width:30}},createRadialGradient(){return {addColorStop(){}}}}, {get:(o,k)=>o[k]||(()=>{})});
 const canvas={getContext:()=>context,parentElement:{clientWidth:600,clientHeight:500},style:{},getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){}};
 const sandbox={window:{devicePixelRatio:3,innerWidth:600},document:{querySelector(id){if(!controls.has(id))controls.set(id,{});return controls.get(id)}},ResizeObserver:class{constructor(fn){resize=fn}observe(){resize()}disconnect(){}},requestAnimationFrame(fn){frames.set(++serial,fn);return serial},cancelAnimationFrame(id){frames.delete(id)}};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 cleanup=sandbox.createTumbleweedGraph(canvas,[{id:'one',title:'One',kind:'note',topics:[]}],[],()=>{opened++;cleanup()});
 return {canvas,controls,frames,cleanup,resize:()=>resize(),flush(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn())},get draws(){return draws},get opened(){return opened}};
}
let g=setup();assert.equal(g.frames.size,1);g.resize();g.resize();assert.equal(g.frames.size,1);g.flush();assert.equal(g.draws,1);assert.equal(g.canvas.width,1200);console.log('PASS resize is coalesced and density capped');
for(let i=0;i<20;i++)g.controls.get('#rotate-left').onclick();assert.equal(g.frames.size,1);g.flush();assert.equal(g.draws,2);console.log('PASS repeated controls draw once per frame');
for(let i=0;i<20;i++)g.canvas.onpointermove({clientX:-100,clientY:-100});assert.equal(g.frames.size,0);console.log('PASS unchanged empty hover does not redraw');
g.controls.get('#zoom-in').onclick();g.cleanup();assert.equal(g.frames.size,0);assert.equal(g.canvas.onpointermove,null);g.resize();assert.equal(g.frames.size,0);console.log('PASS disposal cancels work and detaches input');
g=setup();g.flush();g.canvas.onpointerdown({button:2,pointerId:1,clientX:100,clientY:100});g.canvas.onpointermove({clientX:-100,clientY:-100});assert.equal(g.frames.size,0);console.log('PASS secondary pointer does not rotate');
g.cleanup();
