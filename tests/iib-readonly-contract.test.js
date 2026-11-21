"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dashboard = fs.readFileSync(path.join(__dirname, "../js/iib-dashboard.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../industrial-investment-board.html"), "utf8");
const auth = fs.readFileSync(path.join(__dirname, "../js/player-auth.js"), "utf8");

test("dashboard uses guarded backend read-only API, not obsolete /api/iib", () => {
 assert.match(dashboard, /\/api\/industrial-investment/);
 assert.doesNotMatch(dashboard, /["']\/api\/iib["']/);
});
test("dashboard never sends orders, transfers, or payout requests", () => {
 assert.match(dashboard, /method\s*:\s*["']GET["']|async function get\(path\)/);
 assert.doesNotMatch(dashboard, /fetch\([^\n]+method\s*:\s*["']POST["']/);
 assert.doesNotMatch(dashboard, /\/buy["']|\/sell["']|\/payout["']/);
});
test("dashboard requires signed player session and inherits authenticated fetch", () => {
 assert.match(html, /data-requires-login="true"/);
 assert.match(html, /js\/player-auth\.js/);
 assert.match(dashboard, /MDEAuth\?\.getToken\(\)/);
 assert.match(auth, /window\.fetch\s*=\s*function authenticatedFetch/);
 assert.match(auth, /Bearer /);
});
test("industry changes invalidate stale price history requests", () => {
 assert.match(dashboard, /historyRequestId/);
 assert.match(dashboard, /requestId!==state\.historyRequestId/);
});

test("dashboard requires an OPEN week before showing live price history", () => {
 assert.match(dashboard, /state\.active=week\.active===true&&week\.week\?\.status==="OPEN"&&validWeek/);
 assert.match(dashboard, /state\.active=false/);
});

test("dashboard fails closed when history reports that the week has ended", () => {
 assert.match(dashboard, /if\(result\.active!==true\)/);
 assert.match(dashboard, /state\.active=false;[\s\S]*renderSectors\(\);[\s\S]*Market week is no longer open/);
});

test("dashboard does not claim active market after a history request failure", () => {
 assert.match(dashboard, /catch\(_\)\{if\(requestId===state\.historyRequestId\)\{/);
 assert.match(dashboard, /Market data unavailable\. Live status cannot be confirmed\./);
 assert.match(dashboard, /state\.active=false;[\s\S]*renderSectors\(\);/);
});

test("dashboard rejects malformed history payloads and mismatched industry", () => {
 assert.match(dashboard, /!Array\.isArray\(result\.history\) \|\| result\.industry!==industry/);
 assert.match(dashboard, /Invalid market history response\./);
});

test("dashboard validates settlement prices and indexes before rendering", () => {
 assert.match(dashboard, /row\.industry===industry/);
 assert.match(dashboard, /Number\.isFinite\(Number\(row\.next_price\)\)/);
 assert.match(dashboard, /Number\(row\.next_price\)>0/);
 assert.match(dashboard, /Number\.isSafeInteger\(Number\(row\.settlement_index\)\)/);
 assert.match(dashboard, /Invalid market price records\./);
});

test("dashboard rejects duplicate or missing settlement indexes", () => {
 assert.match(dashboard, /const coherent=rows\.every/);
 assert.match(dashboard, /Number\(rows\[i-1\]\.settlement_index\)===Number\(row\.settlement_index\)\+1/);
 assert.match(dashboard, /if\(!valid\|\|!coherent\)/);
});

test("history checks that consecutive settlements are exactly two hours apart", () => {
 assert.match(dashboard, /Date\.parse\(rows\[i-1\]\.settlement_at\)>Date\.parse\(row\.settlement_at\)/);
 assert.match(dashboard, /Date\.parse\(rows\[i-1\]\.settlement_at\)-Date\.parse\(row\.settlement_at\)===2\*60\*60\*1000/);
});

const vm = require("node:vm");

async function runDashboardScenario(historyPayload,weekPayload=null) {
 const elements=new Map();
 function element(id){
  if(!elements.has(id))elements.set(id,{
   textContent:"",children:[],attributes:{},
   replaceChildren(){this.children=[];},
   append(...children){this.children.push(...children);},
   setAttribute(k,v){this.attributes[k]=v;},
   addEventListener(){},
  });
  return elements.get(id);
 }
 const calls=[];
 const fetch=async url=>{
  calls.push(url);
  let body;
  if(url.endsWith("/status"))body={success:true,active:true};
  else if(url.endsWith("/week"))body=weekPayload||{success:true,active:true,week:{
   status:"OPEN",week_start:"2026-11-16T00:00:00Z",week_end:"2026-11-23T00:00:00Z"
  }};
  else if(url.includes("/history?")){
   if(historyPayload instanceof Error)throw historyPayload;
   body=historyPayload;
  }
  else if(url.endsWith("/eligibility"))body={success:true,epDay:1200,minEpDay:1000,eligible:true};
  else throw Error("Unexpected URL "+url);
  return {ok:true,json:async()=>body};
 };
 vm.runInNewContext(dashboard,{
  location:{hostname:"localhost"},
  window:{MDEAuth:{getToken:()=>"test-session"}},
  document:{getElementById:element,createElement:()=>element(Symbol()),createElementNS:()=>element(Symbol())},
  fetch,console,Date,Number,Array,String,Math,encodeURIComponent
 });
 // The dashboard initializes asynchronously on load.
 for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
 return {elements,calls,get:id=>element(id)};
}
test("runtime: closed-week history hides live market and price rows",async()=>{
 const view=await runDashboardScenario({success:true,active:false,industry:"food",history:[]});
 assert.match(view.get("iibStatus").textContent,/Market not active/);
 assert.equal(view.get("iibHistory").children.length,0);
 assert.match(view.get("iibHistoryMessage").textContent,/no longer open/);
});
test("runtime: inconsistent settlements never render a partial price chart",async()=>{
 const row=(index,time)=>({industry:"food",settlement_index:index,settlement_at:time,previous_price:"100",next_price:"101"});
 const view=await runDashboardScenario({success:true,active:true,industry:"food",history:[
  row(3,"2026-11-16T06:00:00Z"),row(1,"2026-11-16T02:00:00Z")
 ]});
 assert.match(view.get("iibHistoryMessage").textContent,/Invalid market price records/);
 assert.equal(view.get("iibHistory").children.length,0);
 assert.equal(view.get("iibChart").children.length,0);
});
test("runtime: valid contiguous settlements render newest-first history",async()=>{
 const row=(index,time,price)=>({industry:"food",settlement_index:index,settlement_at:time,previous_price:"100",next_price:price});
 const view=await runDashboardScenario({success:true,active:true,industry:"food",history:[
  row(2,"2026-11-16T04:00:00Z","103"),row(1,"2026-11-16T02:00:00Z","101")
 ]});
 assert.match(view.get("iibStatus").textContent,/Market is active/);
 assert.equal(view.get("iibHistory").children.length,2);
 assert.equal(view.get("iibChart").children.length,1);
});

test("runtime: network failure clears live status and keeps chart empty",async()=>{
 const view=await runDashboardScenario(new Error("simulated network outage"));
 assert.match(view.get("iibStatus").textContent,/Market data unavailable/);
 assert.match(view.get("iibHistoryMessage").textContent,/temporarily unavailable/);
 assert.equal(view.get("iibHistory").children.length,0);
 assert.equal(view.get("iibChart").children.length,0);
});
test("runtime: malformed industry response is not displayed",async()=>{
 const view=await runDashboardScenario({success:true,active:true,industry:"chemical",history:[]});
 assert.match(view.get("iibHistoryMessage").textContent,/Invalid market history response/);
 assert.equal(view.get("iibHistory").children.length,0);
});
test("runtime: nonpositive settlement prices are rejected",async()=>{
 const view=await runDashboardScenario({success:true,active:true,industry:"food",history:[{
  industry:"food",settlement_index:1,settlement_at:"2026-11-16T02:00:00Z",
  previous_price:"100",next_price:"0"
 }]});
 assert.match(view.get("iibHistoryMessage").textContent,/Invalid market price records/);
 assert.equal(view.get("iibHistory").children.length,0);
});

test("runtime: malformed week dates never show a live market or request history",async()=>{
 const view=await runDashboardScenario({success:true,active:true,industry:"food",history:[]},{
  success:true,active:true,week:{status:"OPEN",week_start:"not-a-date",week_end:"2026-11-23T00:00:00Z"}
 });
 assert.match(view.get("iibStatus").textContent,/Market not active/);
 assert.match(view.get("iibWeek").textContent,/unavailable/);
 assert.equal(view.calls.some(url=>url.includes("/history?")),false);
});
test("runtime: non-Monday week boundaries cannot activate market",async()=>{
 const view=await runDashboardScenario({success:true,active:true,industry:"food",history:[]},{
  success:true,active:true,week:{status:"OPEN",week_start:"2026-11-17T00:00:00Z",week_end:"2026-11-24T00:00:00Z"}
 });
 assert.match(view.get("iibStatus").textContent,/Market not active/);
 assert.equal(view.calls.some(url=>url.includes("/history?")),false);
});

test("runtime: expired week is not displayed as live",async()=>{
 const view=await runDashboardScenario({success:true,active:true,industry:"food",history:[]},{
  success:true,active:true,week:{status:"OPEN",week_start:"2020-11-16T00:00:00Z",week_end:"2020-11-23T00:00:00Z"}
 });
 assert.match(view.get("iibStatus").textContent,/Market not active/);
 assert.equal(view.calls.some(url=>url.includes("/history?")),false);
});
test("runtime: future week cannot display live prices",async()=>{
 const view=await runDashboardScenario({success:true,active:true,industry:"food",history:[]},{
  success:true,active:true,week:{status:"OPEN",week_start:"2030-11-18T00:00:00Z",week_end:"2030-11-25T00:00:00Z"}
 });
 assert.match(view.get("iibStatus").textContent,/Market not active/);
 assert.equal(view.calls.some(url=>url.includes("/history?")),false);
});
