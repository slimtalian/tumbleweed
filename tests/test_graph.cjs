const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../public/graph.js'),'utf8');
function setup(){
 let draws=0,serial=0,resize,opened=0,cleanup;const frames=new Map(),controls=new Map(),listeners=new Map();
 const context=new Proxy({clearRect(){draws++},measureText(){return {width:30}},createRadialGradient(){return {addColorStop(){}}}}, {get:(o,k)=>o[k]||(()=>{})});
 const canvas={getContext:()=>context,parentElement:{clientWidth:600,clientHeight:500},style:{},addEventListener(type,fn,options){listeners.set(type,{fn,options})},removeEventListener(type){listeners.delete(type)},getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){}};
 const sandbox={window:{devicePixelRatio:3,innerWidth:600},document:{querySelector(id){if(!controls.has(id))controls.set(id,{});return controls.get(id)}},ResizeObserver:class{constructor(fn){resize=fn}observe(){resize()}disconnect(){}},requestAnimationFrame(fn){frames.set(++serial,fn);return serial},cancelAnimationFrame(id){frames.delete(id)}};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 cleanup=sandbox.createTumbleweedGraph(canvas,[{id:'one',title:'One',kind:'note',topics:[]}],[],()=>{opened++;cleanup()});
 return {canvas,controls,frames,listeners,cleanup,get camera(){return vm.runInContext('graphCamera',sandbox)},resize:()=>resize(),flush(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn())},get draws(){return draws},get opened(){return opened}};
}
let g=setup();assert.equal(g.frames.size,1);g.resize();g.resize();assert.equal(g.frames.size,1);g.flush();assert.equal(g.draws,1);assert.equal(g.canvas.width,1200);console.log('PASS resize is coalesced and density capped');
for(let i=0;i<20;i++)g.controls.get('#rotate-left').onclick();assert.equal(g.frames.size,1);g.flush();assert.equal(g.draws,2);console.log('PASS repeated controls draw once per frame');
for(let i=0;i<20;i++)g.canvas.onpointermove({clientX:-100,clientY:-100});assert.equal(g.frames.size,0);console.log('PASS unchanged empty hover does not redraw');
g.controls.get('#zoom-in').onclick();g.cleanup();assert.equal(g.frames.size,0);assert.equal(g.canvas.onpointermove,null);g.resize();assert.equal(g.frames.size,0);console.log('PASS disposal cancels work and detaches input');
g=setup();g.flush();g.canvas.onpointerdown({button:2,pointerId:1,clientX:100,clientY:100});g.canvas.onpointermove({clientX:-100,clientY:-100});assert.equal(g.frames.size,0);console.log('PASS secondary pointer does not rotate');
g.cleanup();

function event(id,x,y,type='touch'){return {pointerId:id,clientX:x,clientY:y,button:0,pointerType:type,prevented:false,preventDefault(){this.prevented=true}}}
g=setup();g.flush();assert.equal(g.canvas.style.touchAction,'none');let e=event(1,100,100);g.canvas.onpointerdown(e);assert.equal(e.prevented,true);e=event(1,100,180);g.canvas.onpointermove(e);assert.equal(e.prevented,true);g.canvas.onpointerup(e);assert.equal(g.opened,0);g.cleanup();assert.notEqual(g.camera.pitch,-.12);console.log('PASS vertical touch turns the map and consumes the gesture');
g=setup();g.flush();g.canvas.onpointerdown(event(1,100,100));const second=event(2,200,100);second.isPrimary=false;g.canvas.onpointerdown(second);g.canvas.onpointermove(event(2,300,100));g.canvas.onpointerup(event(2,300,100));g.canvas.onpointerup(event(1,100,100));assert.equal(g.opened,0);g.cleanup();assert.equal(g.camera.zoom,2);console.log('PASS secondary touch pinches to zoom without opening a record');
g=setup();g.flush();g.canvas.onpointerdown(event(1,100,100));g.canvas.onpointerdown(event(2,200,100));g.canvas.onpointermove(event(2,5000,100));g.canvas.onpointercancel(event(2,5000,100));g.canvas.onpointermove(event(1,100,150));g.canvas.onpointerup(event(1,100,150));g.cleanup();assert.equal(g.camera.zoom,3);assert.equal(g.opened,0);assert.notEqual(g.camera.pitch,-.12);console.log('PASS pinch clamps and cancellation resumes one-finger rotation');
for(const mode of [0,1,2]){g=setup();g.flush();const binding=g.listeners.get('wheel');assert.equal(binding.options.passive,false);e={deltaY:-1,deltaMode:mode,ctrlKey:false,preventDefault(){this.prevented=true}};binding.fn(e);assert.equal(e.prevented,true);g.cleanup();assert.ok(g.camera.zoom>1);assert.equal(g.listeners.size,0);}console.log('PASS plain wheel zoom supports all delta modes and removes its listener');
g=setup();g.flush();g.canvas.onpointerdown(event(1,100,100));g.canvas.onlostpointercapture(event(1,100,100));g.canvas.onpointerup(event(1,100,100));assert.equal(g.opened,0);g.cleanup();console.log('PASS lost capture cannot activate a stale tap');
