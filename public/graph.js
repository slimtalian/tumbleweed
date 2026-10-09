'use strict';
// Decorative branching fibers form the silhouette. Only edges supplied by the
// workspace are semantic connections; fibers are never persisted as evidence.
let graphCamera=null;
function createTumbleweedGraph(canvas, records, edges, onOpen, options={}) {
 const ctx=canvas.getContext('2d'),parent=canvas.parentElement;
 const nodes=records.slice(0,1500),indices=new Map(nodes.map((r,i)=>[r.id,i]));
 let yaw=.18,pitch=-.12,zoom=1,width=0,height=0,positions=[],hover=null,drag=null,focus='',labels=!options.specimen,texture=true;
 if(graphCamera)({yaw,pitch,zoom,labels,texture}=graphCamera);
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
 function project(p){const x=p.x*Math.cos(yaw)-p.z*Math.sin(yaw),z=p.x*Math.sin(yaw)+p.z*Math.cos(yaw),y=p.y*Math.cos(pitch)-z*Math.sin(pitch),depth=p.y*Math.sin(pitch)+z*Math.cos(pitch);const scale=Math.min(width*(options.specimen?.33:.39),height*.40)*zoom, perspective=1+depth*.07;return{x:width/2+x*scale*perspective,y:height*.48+y*scale*.96*perspective,z:depth};}
 function curve(a,b,id){const bend=((hash(id)%100)/100-.5)*.45,dx=b.x-a.x,dy=b.y-a.y;ctx.moveTo(a.x,a.y);ctx.bezierCurveTo(a.x+dx*.32-dy*bend,a.y+dy*.32+dx*bend,a.x+dx*.72-dy*bend*.6,a.y+dy*.72+dx*bend*.6,b.x,b.y);}
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
   handles.forEach((b,i)=>{const angle=-Math.PI*.85+i/groups.length*Math.PI*2,side=Math.cos(angle)<0?-1:1;
    b.classList.toggle('west',side<0);
    const compact=window.innerWidth<=760,labelWidth=b.offsetWidth;
    const rawX=width/2+Math.cos(angle)*Math.min(width*.34,height*.43);
    const x=Math.max(side<0?labelWidth+4:4,Math.min(width-(side>0?labelWidth+4:4),rawX));
    const y=height*(compact?.46:.48)+Math.sin(angle)*height*(compact?.32:.40);
    b.style.left=x+'px';b.style.top=y+'px';
    const center=project(centers.get(b.dataset.thread));ctx.beginPath();ctx.moveTo(center.x,center.y);ctx.quadraticCurveTo(x,y-15,x,y);ctx.lineWidth=options.collection===b.dataset.thread?1.5:.7;ctx.strokeStyle=options.collection===b.dataset.thread?'#c6ad72':'rgba(162,140,98,.25)';ctx.stroke();
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
 function resize(){width=parent.clientWidth;height=parent.clientHeight;const ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=width*ratio;canvas.height=height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);paint();}
 const observer=new ResizeObserver(resize);observer.observe(parent);
 const point=e=>{const bounds=canvas.getBoundingClientRect();return{x:e.clientX-bounds.left,y:e.clientY-bounds.top};};
 const hit=p=>[...positions].sort((a,b)=>b.z-a.z).find(a=>Math.hypot(a.x-p.x,a.y-p.y)<Math.max(a.size+7,window.innerWidth<=760?18:0));
 canvas.onpointerdown=e=>{drag={...point(e),start:point(e),moved:false};canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{const p=point(e);if(drag){if(e.pointerType==='touch'&&Math.abs(p.y-drag.start.y)>Math.abs(p.x-drag.start.x))return;yaw+=(p.x-drag.x)*.008;pitch+=(p.y-drag.y)*.008;drag.moved ||= Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>4;drag.x=p.x;drag.y=p.y;hover=null;}else{hover=hit(p)||null;canvas.style.cursor=hover?'pointer':'grab';}paint();};
 canvas.onpointerup=e=>{if(drag&&!drag.moved){const p=hit(point(e));if(p){focus=p.r.id;onOpen(p.r.id);}}drag=null;paint();};
 canvas.onpointercancel=()=>{drag=null;};canvas.onpointerleave=()=>{hover=null;paint();};
 canvas.onwheel=e=>{if(!e.ctrlKey)return;e.preventDefault();zoom=Math.max(.35,Math.min(3,zoom-e.deltaY*.001));paint();};
 document.querySelector('#rotate-left').onclick=()=>{yaw-=.25;paint();};document.querySelector('#rotate-right').onclick=()=>{yaw+=.25;paint();};document.querySelector('#zoom-in').onclick=()=>{zoom=Math.min(3,zoom+.15);paint();};document.querySelector('#zoom-out').onclick=()=>{zoom=Math.max(.35,zoom-.15);paint();};document.querySelector('#graph-reset').onclick=()=>{yaw=.18;pitch=-.12;zoom=1;focus='';document.querySelector('#graph-focus').value='';paint();};
 document.querySelector('#graph-labels').onchange=e=>{labels=e.target.checked;paint();};document.querySelector('#graph-texture').onchange=e=>{texture=e.target.checked;paint();};document.querySelector('#graph-focus').onchange=e=>{focus=e.target.value;paint();};
 return ()=>{graphCamera={yaw,pitch,zoom,labels,texture};observer.disconnect();};
}
