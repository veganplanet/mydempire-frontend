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
  // The week may close between /status, /week and /history requests.
  // Fail closed instead of presenting stale prices as an active market.
  if(result.active!==true){
   state.active=false;
   renderSectors();
   text("iibStatus","Market not active. Trading is unavailable.");
   text("iibHistoryMessage","Market week is no longer open. No live prices are shown.");
   return;
  }
  // Reject malformed payloads rather than presenting partial or fabricated history.
  if(!Array.isArray(result.history) || result.industry!==industry){
   state.active=false;
   renderSectors();
   text("iibStatus","Market data unavailable. Live status cannot be confirmed.");
   text("iibHistoryMessage","Invalid market history response.");
   return;
  }
  const rows=result.history;
  // Validate the complete response before rendering any prices. Never show
  // nonpositive, nonnumeric or wrong-industry settlements as live quotes.
  const valid=rows.every(row=>row&&row.industry===industry&&
   Number.isFinite(Number(row.previous_price))&&Number(row.previous_price)>0&&
   Number.isFinite(Number(row.next_price))&&Number(row.next_price)>0&&
   Number.isSafeInteger(Number(row.settlement_index))&&Number(row.settlement_index)>=1&&
   Number(row.settlement_index)<=84&&
   typeof row.settlement_at==="string"&&Number.isFinite(Date.parse(row.settlement_at)));
  if(!valid){
   state.active=false;
   renderSectors();
   text("iibStatus","Market data unavailable. Live status cannot be confirmed.");
   text("iibHistoryMessage","Invalid market price records.");
   return;
  }
  for(const row of rows.slice(0,84)){
   const tr=document.createElement("tr");
   for(const value of [new Date(row.settlement_at).toLocaleString("en-GB",{timeZone:"UTC"})+" UTC",row.previous_price,row.next_price]){
    const td=document.createElement("td");td.textContent=String(value??"—");tr.append(td);
   }
   tbody.append(tr);
  }
  draw([...rows].reverse());
  text("iibHistoryMessage",rows.length?rows.length+" published price observations":"No published prices yet.");
 }catch(_){if(requestId===state.historyRequestId){
  // A failed history request cannot be treated as a confirmed live quote.
  state.active=false;
  renderSectors();
  text("iibStatus","Market data unavailable. Live status cannot be confirmed.");
  text("iibHistoryMessage","Price history is temporarily unavailable.");
 }}
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
