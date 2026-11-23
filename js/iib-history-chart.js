(function(){
'use strict';
const api=(location.hostname==='localhost'||location.hostname==='127.0.0.1'?'http://localhost:10000':'https://mydempire-backend-1.onrender.com')+'/api/iib/v2/history';
const names={food:'🌾 Food',textile:'🧵 Textile',pharma:'💊 Pharma',chemical:'⚗️ Chemical',supermarket:'🛒 Supermarket'};
const svg=document.getElementById('history-chart'),note=document.getElementById('history-note'),buttons=document.getElementById('history-industries');
const ns='http://www.w3.org/2000/svg';
let selected='food',history=[],week=null;
function node(tag,attributes,text){
 const item=document.createElementNS(ns,tag);
 for(const [key,value] of Object.entries(attributes))item.setAttribute(key,String(value));
 if(text!==undefined)item.textContent=text;
 return item;
}
function controls(){
 buttons.replaceChildren();
 for(const [id,label] of Object.entries(names)){
  const b=document.createElement('button');b.type='button';b.textContent=label;
  b.className=id===selected?'':'secondary';b.setAttribute('aria-pressed',String(id===selected));
  b.addEventListener('click',()=>{selected=id;controls();draw();});buttons.append(b);
 }
}
function draw(){
 svg.replaceChildren();
 const rows=history.filter(r=>r.industry===selected).sort((a,b)=>a.intervalIndex-b.intervalIndex);
 if(!rows.length){note.textContent='No published updates for '+names[selected]+' yet.';return;}
 const points=rows.map(r=>({time:Date.parse(r.publishedAt),pct:(Number(r.priceMicro)/100000000-1)*100})).filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.pct));
 if(!points.length){note.textContent='Market history is unavailable.';return;}
 const weekStart=Date.parse(week?.startsAt),weekEnd=Date.parse(week?.endsAt);
 if(!Number.isFinite(weekStart)||!Number.isFinite(weekEnd)||weekEnd<=weekStart){note.textContent='Market week information is unavailable.';return;}
 const vals=points.map(p=>p.pct);let low=Math.min(0,...vals),high=Math.max(0,...vals);
 const padding=Math.max((high-low)*0.15,0.5);low-=padding;high+=padding;
 const x=t=>50+Math.max(0,Math.min(1,(t-weekStart)/(weekEnd-weekStart)))*640;
 const y=v=>225-(v-low)/(high-low)*190;
 for(let i=0;i<=4;i++){
  const v=low+(high-low)*i/4,yy=y(v);
  svg.append(node('line',{x1:50,y1:yy,x2:690,y2:yy,stroke:'#e5e7eb'}));
  svg.append(node('text',{x:44,y:yy+4,'text-anchor':'end','font-size':11,fill:'#64748b'},v.toFixed(1)+'%'));
 }
 const color=points[points.length-1].pct>=0?'#16a34a':'#dc2626';
 const zero=y(0);svg.append(node('line',{x1:50,y1:zero,x2:690,y2:zero,stroke:'#94a3b8','stroke-dasharray':'4 4'}));
 if(points.length>1)svg.append(node('polyline',{points:points.map(p=>x(p.time)+','+y(p.pct)).join(' '),fill:'none',stroke:color,'stroke-width':3,'stroke-linejoin':'round'}));
 for(const p of points)svg.append(node('circle',{cx:x(p.time),cy:y(p.pct),r:3,fill:color}));
 svg.append(node('text',{x:50,y:252,'font-size':11,fill:'#64748b'},new Date(weekStart).toISOString().slice(5,10)+' UTC'));
 svg.append(node('text',{x:690,y:252,'text-anchor':'end','font-size':11,fill:'#64748b'},new Date(weekEnd).toISOString().slice(5,10)+' UTC'));
 const last=points[points.length-1];
 note.textContent=names[selected]+': '+(last.pct>=0?'+':'')+last.pct.toFixed(2)+'% this week · '+points.length+' published update'+(points.length===1?'':'s')+' · last updated '+new Date(last.time).toUTCString();
}
async function refresh(){
 try{
  const response=await fetch(api,{cache:'no-store',headers:{Accept:'application/json'}});
  const data=await response.json();
  if(!response.ok||data.success!==true)throw Error('unavailable');
  if(!data.active){history=[];week=null;svg.replaceChildren();note.textContent='No active market week.';return;}
  if(!Array.isArray(data.history)||!data.week)throw Error('invalid');
  history=data.history.filter(r=>Object.hasOwn(names,r.industry)&&/^[0-9]+$/.test(String(r.priceMicro))&&Number(r.priceMicro)>0&&Number.isInteger(r.intervalIndex));
  week=data.week;draw();
 }catch(error){svg.replaceChildren();note.textContent='Market history is temporarily unavailable.';}
}
controls();refresh();setInterval(refresh,60000);
})();
