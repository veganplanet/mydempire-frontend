(function(){
"use strict";
const api=(location.hostname==="localhost"||location.hostname==="127.0.0.1"?"http://localhost:10000":"https://mydempire-backend-1.onrender.com")+"/api/industrial-investment";
const industries=[["food","🌾 Food"],["textile","🧵 Textile"],["pharma","💊 Pharma"],["chemical","⚗️ Chemical"],["supermarket","🛒 Supermarket"]];
const el=id=>document.getElementById(id);
const state={active:false,selected:"food",historyRequestId:0};
async function get(path){
 const response=await fetch(api+path,{headers:{"Accept":"application/json"},cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.success!==true)throw new Error(data.error||"Market service unavailable");
 return data;
}
function text(id,value){el(id).textContent=value;}
function renderSectors(){
 const root=el("iibSectors");root.replaceChildren();
 for(const [id,label] of industries){
  const button=document.createElement("button");button.type="button";
  button.className="iib-sector";button.setAttribute("aria-pressed",String(state.selected===id));
  const title=document.createElement("strong");title.textContent=label;
  const note=document.createElement("span");note.textContent=state.active?"View published prices":"Market not active";
  button.append(title,note);button.addEventListener("click",()=>{state.selected=id;renderSectors();loadHistory();});
  root.append(button);
 }
}
function draw(rows){
 const svg=el("iibChart");svg.replaceChildren();
 if(rows.length<2)return;
 const prices=rows.map(row=>Number(row.next_price)).filter(Number.isFinite);
 if(prices.length!==rows.length)return;
 const low=Math.min(...prices),high=Math.max(...prices),spread=Math.max(high-low,0.000001);
 const points=prices.map((price,i)=>[20+i*680/(prices.length-1),220-(price-low)/spread*195]);
 const line=document.createElementNS("http://www.w3.org/2000/svg","polyline");
 line.setAttribute("points",points.map(p=>p.join(",")).join(" "));
 line.setAttribute("fill","none");line.setAttribute("stroke","#6d28d9");line.setAttribute("stroke-width","3");
 svg.append(line);
}
async function loadHistory(){
 const requestId=++state.historyRequestId;
 const industry=state.selected;
 text("iibHistoryTitle","Published price history — "+industry);
 const tbody=el("iibHistory");tbody.replaceChildren();el("iibChart").replaceChildren();
 if(!state.active){text("iibHistoryMessage","No live market prices are available.");return;}
 try{
  const result=await get("/history?industry="+encodeURIComponent(industry)+"&limit=84");
  if(requestId!==state.historyRequestId)return;
  const rows=Array.isArray(result.history)?result.history:[];
  for(const row of rows.slice(0,84)){
   const tr=document.createElement("tr");
   for(const value of [new Date(row.settlement_at).toLocaleString("en-GB",{timeZone:"UTC"})+" UTC",row.previous_price,row.next_price]){
    const td=document.createElement("td");td.textContent=String(value??"—");tr.append(td);
   }
   tbody.append(tr);
  }
  draw([...rows].reverse());
  text("iibHistoryMessage",rows.length?rows.length+" published price observations":"No published prices yet.");
 }catch(_){if(requestId===state.historyRequestId)text("iibHistoryMessage","Price history is temporarily unavailable.");}
}
async function init(){
 if(!window.MDEAuth?.getToken()){text("iibStatus","Please sign in with Hive Keychain to view market data.");text("iibEligibility","Sign in required.");renderSectors();text("iibHistoryMessage","Sign in to view published prices.");return;}
 try{
  const result=await get("/status");
  state.active=false;
  if(result.active===true){
   try{
    const week=await get("/week");
    state.active=week.active===true&&week.week?.status==="OPEN";
    text("iibWeek",week.week?"Week: "+new Date(week.week.week_start).toISOString().slice(0,10)+" to "+new Date(week.week.week_end).toISOString().slice(0,10)+" UTC · "+week.week.status:"No active market week.");
   }catch(_){text("iibWeek","Week information unavailable. Market data is paused.");}
  }
  text("iibStatus",state.active?"Market is active — read-only dashboard":"Market not active. Trading is unavailable.");
 }catch(_){text("iibStatus","IIB API is not available yet. No live market data is being shown.");}
 renderSectors();await loadHistory();
 try{
  const result=await get("/eligibility");
  text("iibEligibility",String(result.epDay)+" EP/day · minimum "+String(result.minEpDay)+" EP/day · "+(result.eligible?"Eligible":"Not yet eligible"));
 }catch(_){text("iibEligibility","Eligibility information unavailable.");}
}
init();
})();
