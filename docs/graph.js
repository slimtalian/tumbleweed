'use strict';
// Decorative branching fibers form the silhouette. Only edges supplied by the
// workspace are semantic connections; fibers are never persisted as evidence.
let graphCamera=null;
function createTumbleweedGraph(canvas, records, edges, onOpen, options={}) {
 const ctx=canvas.getContext('2d'),parent=canvas.parentElement;
 const nodes=records.slice(0,1500),indices=new Map(nodes.map((r,i)=>[r.id,i]));
 let yaw=.18,pitch=-.12,roll=0,zoom=1,width=0,height=0,positions=[],hover=null,drag=null,focus='',labels=!options.specimen,texture=true;
 if(graphCamera)({yaw,pitch,roll=0,zoom,labels,texture}=graphCamera);
 document.querySelector('#graph-labels').checked=labels;document.querySelector('#graph-texture').checked=texture;
 let seed=872349;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
 const v=(x,y,z)=>({x,y,z});
 const plus=(a,b)=>v(a.x+b.x,a.y+b.y,a.z+b.z), mul=(a,k)=>v(a.x*k,a.y*k,a.z*k);
 const mix=(a,b,t)=>plus(mul(a,1-t),mul(b,t));
 const unit=()=>{const z=random()*2-1,t=random()*Math.PI*2,r=Math.sqrt(1-z*z);return v(r*Math.cos(t),r*Math.sin(t),z);};
 const cross=(a,b)=>v(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
 const normal=a=>mul(a,1/(Math.hypot(a.x,a.y,a.z)||1));
 const groups=options.groups||[],centers=new Map(groups.map((g,i)=>{const angle=-Math.PI*.85+i/groups.length*Math.PI*2;return [g,v(Math.cos(angle)*.61,Math.sin(angle)*.65,Math.sin(i*2.3)*.11)];}));
 const degree=new Map(nodes.map(r=>[r.id,0]));
 for(const e of edges){degree.set(e.from,(degree.get(e.from)||0)+1);degree.set(e.to,(degree.get(e.to)||0)+1);}
 const points=nodes.map(r=>{
  // Nearby records share a collection, but proximity never creates an evidence edge.
  seed=hash(r.collection||'Unsorted');const center=centers.get(r.collection)||mul(unit(),.48);
  seed=hash(r.id);const offset=mul(unit(),options.specimen?.07+random()*.2:.13+random()*.36);
  return {...plus(center,offset),r};
 });
 // Deterministic rough ovoid with splitting, broken arcs rather than a wire sphere.
 seed=81721;
 const fibers=[];
 for(let strand=0;strand<92;strand++){
  const axis=unit(),a=normal(cross(axis,Math.abs(axis.y)>.9?v(1,0,0):v(0,1,0))),b=cross(axis,a);
  const start=random()*Math.PI*2,span=1.6+random()*3.9,rad=.55+random()*.49,phase=random()*9;
  const path=[];
  for(let step=0;step<=26;step++){
   const t=step/26,angle=start+span*t;
   const rough=rad*(1+.055*Math.sin(angle*5+phase)+.025*Math.cos(angle*11-phase));
   path.push(plus(mul(plus(mul(a,Math.cos(angle)),mul(b,Math.sin(angle))),rough),mul(axis,.09*Math.sin(angle*2+phase))));
  }
  fibers.push({path,weight:strand%6===0?1:.55,alpha:.18+random()*.12});
  for(let fork=0;fork<4;fork++){
   const at=3+Math.floor(random()*21),root=path[at],tangent=normal(plus(path[at+1],mul(path[at-1],-1))),side=mul(axis,(random()-.5)*.35),length=.05+random()*.15;
   const tip=plus(root,plus(mul(tangent,length),side));
   fibers.push({path:[root,mix(root,tip,.5),plus(tip,mul(normal(root),.018))],weight:.5,alpha:.2});
   if(fork%2===0)fibers.push({path:[mix(root,tip,.55),plus(tip,mul(axis,.045))],weight:.4,alpha:.15});
  }
 }
 const nodeColor=r=>r.kind==='project'?'#c4ab78':r.kind==='conversation'||r.kind==='note'?'#a0b2a2':r.kind==='experience'?'#899b86':r.kind==='artifact'||r.kind==='resource'?'#b0a58f':'#b4b6a4';
 const shown={yaw,pitch,roll,zoom};
 function project(p){const x=p.x*Math.cos(shown.yaw)-p.z*Math.sin(shown.yaw),z=p.x*Math.sin(shown.yaw)+p.z*Math.cos(shown.yaw),y=p.y*Math.cos(shown.pitch)-z*Math.sin(shown.pitch),depth=p.y*Math.sin(shown.pitch)+z*Math.cos(shown.pitch);const rx=x*Math.cos(shown.roll)-y*Math.sin(shown.roll),ry=x*Math.sin(shown.roll)+y*Math.cos(shown.roll),scale=Math.min(width*(options.specimen?.33:.39),height*.40)*shown.zoom,perspective=1+depth*.07;return{x:width/2+rx*scale*perspective,y:height*.48+ry*scale*.96*perspective,z:depth};}
 function curve(a,b,id){const bend=((hash(id)%100)/100-.5)*.45,dx=b.x-a.x,dy=b.y-a.y;ctx.moveTo(a.x,a.y);ctx.bezierCurveTo(a.x+dx*.32-dy*bend,a.y+dy*.32+dx*bend,a.x+dx*.72-dy*bend*.6,a.y+dy*.72+dx*bend*.6,b.x,b.y);}
 let frame=0,disposed=false,lastFrame=0,lastMove=0,velocity={yaw:0,pitch:0,roll:0};
 const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 function stopMotion(){velocity={yaw:0,pitch:0,roll:0};}
 function addRotation(dy,dp,dr){
  yaw+=dy;pitch+=dp;roll+=dr;
  const now=performance.now(),dt=Math.max(8,Math.min(50,now-lastMove)),blend=1-Math.exp(-dt/35);
  for(const [key,delta] of Object.entries({yaw:dy,pitch:dp,roll:dr}))velocity[key]+=(Math.max(-.008,Math.min(.008,delta/dt))-velocity[key])*blend;
  lastMove=now;
 }
 function schedulePaint(){if(!disposed&&!frame){lastFrame=performance.now();frame=requestAnimationFrame(animate);}}
 function animate(now){
  frame=0;if(disposed)return;
  const dt=Math.max(1,Math.min(64,now-lastFrame));lastFrame=now;
  if(reducedMotion?.matches)stopMotion();
  if(!drag){const decay=Math.exp(-dt/230),travel=230*(1-decay);yaw+=velocity.yaw*travel;pitch+=velocity.pitch*travel;roll+=velocity.roll*travel;for(const key of Object.keys(velocity)){velocity[key]*=decay;if(Math.abs(velocity[key])<.00002)velocity[key]=0;}}
  const blend=reducedMotion?.matches?1:1-Math.exp(-dt/32);let settling=false;
  for(const [key,target] of Object.entries({yaw,pitch,roll,zoom})){const gap=target-shown[key];if(Math.abs(gap)<.0001)shown[key]=target;else{shown[key]+=gap*blend;settling=true;}}
  paint();if(settling||Object.values(velocity).some(v=>v!==0)&&!drag)frame=requestAnimationFrame(animate);
 }
 const pauseMotion=()=>{cancelHold();stopMotion();Object.assign(shown,{yaw,pitch,roll,zoom});};
 document.addEventListener('visibilitychange',pauseMotion);
 reducedMotion?.addEventListener('change',pauseMotion);
 function paint(){
  ctx.clearRect(0,0,width,height);
  const active=hover?.r.id||focus;
  const related=new Set([active]);if(active)for(const e of edges){if(e.from===active)related.add(e.to);if(e.to===active)related.add(e.from);}
  // Grounding shadow under the twig silhouette, no network or image asset.
  const shadow=ctx.createRadialGradient(width/2,height*.89,1,width/2,height*.89,width*.27);
  shadow.addColorStop(0,'rgba(0,0,0,.25)');shadow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=shadow;ctx.fillRect(0,height*.81,width,height*.18);
  if(texture&&nodes.length){for(const fiber of fibers){const ps=fiber.path.map(project),depth=ps.reduce((n,p)=>n+p.z,0)/ps.length;ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);for(let i=1;i<ps.length-1;i++){const p=ps[i],next=ps[i+1];ctx.quadraticCurveTo(p.x,p.y,(p.x+next.x)/2,(p.y+next.y)/2);}ctx.lineTo(ps.at(-1).x,ps.at(-1).y);ctx.lineWidth=fiber.weight;ctx.strokeStyle=`rgba(193,157,101,${fiber.alpha*(.82+(depth+1)*.28)*(active?.62:1)})`;ctx.stroke();}}
  if(options.specimen){
   const handles=[...parent.querySelectorAll('[data-thread]')];
   handles.forEach(b=>{
    const origin=centers.get(b.dataset.thread);if(!origin)return;
    const center=project(origin),anchor=project(mul(origin,1.65)),side=anchor.x<width/2?-1:1;
    b.classList.toggle('west',side<0);
    const labelWidth=b.offsetWidth,labelHeight=b.offsetHeight||44;
    const x=Math.max(side<0?labelWidth+4:4,Math.min(width-(side>0?labelWidth+4:4),anchor.x));
    const y=Math.max(labelHeight/2+8,Math.min(height-72-labelHeight/2,anchor.y));
    b.style.left=x+'px';b.style.top=y+'px';b.style.opacity=String(Math.max(.65,Math.min(1,.82+center.z*.2)));b.style.zIndex=String(Math.round(100+center.z*20));
    ctx.beginPath();ctx.moveTo(center.x,center.y);ctx.quadraticCurveTo((center.x+x)/2,(center.y+y)/2-8,x,y);ctx.lineWidth=options.collection===b.dataset.thread?1.5:.7;ctx.strokeStyle=options.collection===b.dataset.thread?'#c6ad72':'rgba(162,140,98,.25)';ctx.stroke();
   });
  }
  positions=points.map(p=>({...project(p),r:p.r,size:p.r.kind==='project'?5.8:2.5+Math.min(3,(degree.get(p.r.id)||0)*.28)}));
  for(const e of edges){const a=positions[indices.get(e.from)],b=positions[indices.get(e.to)];if(!a||!b)continue;const hot=active&&(e.from===active||e.to===active);ctx.beginPath();ctx.strokeStyle=hot?'rgba(230,182,108,.95)':active?'rgba(164,145,111,.065)':'rgba(199,169,119,.36)';ctx.lineWidth=hot?1.7:.85;ctx.setLineDash(e.basis==='inferred'?[4,4]:[]);curve(a,b,e.id);ctx.stroke();}ctx.setLineDash([]);
  for(const p of [...positions].sort((a,b)=>a.z-b.z)){const hit=active===p.r.id,dim=options.matches&&!options.matches.has(p.r.id);ctx.globalAlpha=dim?.13:active&&!related.has(p.r.id)?.2:.7+(p.z+1)*.15;ctx.fillStyle=nodeColor(p.r);if(hit){ctx.beginPath();ctx.arc(p.x,p.y,p.size+6,0,Math.PI*2);ctx.strokeStyle='#e8bd78';ctx.lineWidth=1.3;ctx.stroke();ctx.shadowBlur=13;ctx.shadowColor='#dfb570';}ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  ctx.globalAlpha=1;
  const ranked=[...positions].sort((a,b)=>(degree.get(b.r.id)||0)-(degree.get(a.r.id)||0));
  const featured=labels?(active?positions.filter(p=>related.has(p.r.id)).sort((a,b)=>(b.r.id===active)-(a.r.id===active)).slice(0,8):[...positions.filter(p=>p.r.kind==='project'),...ranked].filter((p,i,arr)=>arr.findIndex(a=>a.r.id===p.r.id)===i).slice(0,width<600?4:7)):hover?[hover]:[];
  const boxes=[];
  for(const p of featured){let text=p.r.title;if(text.length>35)text=text.slice(0,34)+'…';ctx.font=(p.r.id===active?'600 ':'500 ')+'12px Segoe UI';const tw=ctx.measureText(text).width;const x=Math.max(12,Math.min(width-tw-15,p.x+11));let y=p.y-5;for(let i=0;i<4&&boxes.some(b=>x<b.x+b.w&&x+tw>b.x&&Math.abs(y-b.y)<20);i++)y+=20;if(y>height-55||y<20)continue;boxes.push({x,y,w:tw});ctx.fillStyle='rgba(24,26,27,.9)';ctx.fillRect(x-4,y-13,tw+8,19);ctx.fillStyle=p.r.id===active?'#f4d49e':'#dddcd3';ctx.fillText(text,x,y);}
  if(!nodes.length){ctx.fillStyle='#a5a79f';ctx.font='15px Segoe UI';ctx.textAlign='center';ctx.fillText('No records match these filters.',width/2,height/2);ctx.textAlign='left';}
 }
 function resize(){width=parent.clientWidth;height=parent.clientHeight;const ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=width*ratio;canvas.height=height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);schedulePaint();}
 const observer=new ResizeObserver(resize);observer.observe(parent);
 const point=e=>{const bounds=canvas.getBoundingClientRect();return{x:e.clientX-bounds.left,y:e.clientY-bounds.top};};
 const hit=p=>[...positions].sort((a,b)=>b.z-a.z).find(a=>Math.hypot(a.x-p.x,a.y-p.y)<Math.max(a.size+7,window.innerWidth<=760?18:0));
 // The canvas owns gestures; the rest of the page remains scrollable.
 let holdTimer=0,held=false,holdOrigin=null;
 function cancelHold(){clearTimeout(holdTimer);holdTimer=0;holdOrigin=null;if(held){hover=null;held=false;schedulePaint();}}
 const pointers=new Map();let pinchDistance=0,pinchAngle=0,pinchCenter=null;
 const clampZoom=value=>Math.max(.35,Math.min(3,value));
 const distance=()=>{const [a,b]=[...pointers.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
 const gesture=()=>{const [a,b]=[...pointers.values()];return a&&b?{angle:Math.atan2(b.y-a.y,b.x-a.x),x:(a.x+b.x)/2,y:(a.y+b.y)/2}:null;};
 const originalTouchAction=canvas.style.touchAction;canvas.style.touchAction='none';
 canvas.onpointerdown=e=>{
  if(e.button!==0)return;
  cancelHold();
  const interrupted=Object.values(velocity).some(v=>v!==0)&&!pointers.size;
  if(!pointers.size){stopMotion();({yaw,pitch,roll,zoom}=shown);}lastMove=performance.now();
  const p=point(e);pointers.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);
  drag={...p,start:p,moved:interrupted||pointers.size>1};pinchDistance=distance();pinchCenter=gesture();pinchAngle=pinchCenter?.angle||0;stopMotion();hover=null;
  canvas.style.cursor='grabbing';e.preventDefault();
  if(e.pointerType==='touch'&&pointers.size===1){const node=hit(p);if(node){holdOrigin=p;holdTimer=setTimeout(()=>{holdTimer=0;if(disposed||pointers.size!==1||!pointers.has(e.pointerId)||!drag)return;held=true;drag.moved=true;hover=node;stopMotion();schedulePaint();},350);}}
  schedulePaint();
 };
 canvas.onpointermove=e=>{
  const p=point(e);
  if(pointers.has(e.pointerId)){
   e.preventDefault();pointers.set(e.pointerId,p);
   if(holdOrigin&&pointers.size===1){if(Math.hypot(p.x-holdOrigin.x,p.y-holdOrigin.y)<=8)return;cancelHold();}
   if(pointers.size>1){const next=distance();if(pinchDistance>0&&next>0)zoom=clampZoom(zoom*next/pinchDistance);const nextGesture=gesture();const twist=Math.atan2(Math.sin(nextGesture.angle-pinchAngle),Math.cos(nextGesture.angle-pinchAngle));if(pinchCenter)addRotation((nextGesture.x-pinchCenter.x)*.006,(nextGesture.y-pinchCenter.y)*.006,twist);pinchDistance=next;pinchAngle=nextGesture.angle;pinchCenter=nextGesture;drag.moved=true;}
   else if(drag){addRotation((p.x-drag.x)*.006,(p.y-drag.y)*.006,0);drag.moved ||= Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>4;drag.x=p.x;drag.y=p.y;}
   hover=null;
  }else{
   if(pointers.size)return;
   const next=hit(p)||null;if(next?.r.id===hover?.r.id)return;hover=next;canvas.style.cursor=hover?'pointer':'grab';
  }
  schedulePaint();
 };
 function finishPointer(e,cancelled=false){
  if(!pointers.has(e.pointerId))return;
  const selected=!cancelled&&pointers.size===1&&drag&&!drag.moved?hit(point(e)):null;
  cancelHold();
  pointers.delete(e.pointerId);pinchDistance=distance();pinchCenter=gesture();pinchAngle=pinchCenter?.angle||0;
  if(cancelled||selected||pointers.size||performance.now()-lastMove>90||reducedMotion?.matches)stopMotion();
  const remaining=pointers.values().next().value;drag=remaining?{...remaining,start:remaining,moved:true}:null;
  canvas.style.cursor=remaining?'grabbing':'grab';
  if(selected){focus=selected.r.id;onOpen(selected.r.id);}schedulePaint();
 }
 canvas.onpointerup=e=>finishPointer(e);
 canvas.onpointercancel=e=>finishPointer(e,true);
 canvas.onlostpointercapture=e=>finishPointer(e,true);
 canvas.onpointerleave=()=>{if(hover){hover=null;schedulePaint();}};
 const wheel=e=>{e.preventDefault();cancelHold();stopMotion();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?height:1);zoom=clampZoom(zoom*Math.exp(-delta*.0015));schedulePaint();};
 canvas.addEventListener('wheel',wheel,{passive:false});
 canvas.oncontextmenu=e=>{if(held||holdOrigin)e.preventDefault();};
 document.querySelector('#rotate-left').onclick=()=>{stopMotion();yaw-=.25;schedulePaint();};document.querySelector('#rotate-right').onclick=()=>{stopMotion();yaw+=.25;schedulePaint();};document.querySelector('#zoom-in').onclick=()=>{zoom=Math.min(3,zoom+.15);schedulePaint();};document.querySelector('#zoom-out').onclick=()=>{zoom=Math.max(.35,zoom-.15);schedulePaint();};document.querySelector('#graph-reset').onclick=()=>{stopMotion();yaw=.18;pitch=-.12;roll=0;zoom=1;focus='';document.querySelector('#graph-focus').value='';schedulePaint();};
 document.querySelector('#graph-labels').onchange=e=>{labels=e.target.checked;schedulePaint();};document.querySelector('#graph-texture').onchange=e=>{texture=e.target.checked;schedulePaint();};document.querySelector('#graph-focus').onchange=e=>{focus=e.target.value;schedulePaint();};
 return ()=>{disposed=true;cancelHold();stopMotion();document.removeEventListener('visibilitychange',pauseMotion);reducedMotion?.removeEventListener('change',pauseMotion);pointers.clear();canvas.removeEventListener('wheel',wheel);canvas.style.touchAction=originalTouchAction;cancelAnimationFrame(frame);frame=0;drag=null;graphCamera={yaw:shown.yaw,pitch:shown.pitch,roll:shown.roll,zoom:shown.zoom,labels,texture};observer.disconnect();for(const event of ['onpointerdown','onpointermove','onpointerup','onpointercancel','onlostpointercapture','onpointerleave','oncontextmenu'])canvas[event]=null;};
}
