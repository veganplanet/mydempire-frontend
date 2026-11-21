(function(){
"use strict";
/** Trade ticket wired to the authenticated API; release remains explicitly locked. */
const TRADING_RELEASE_APPROVED=false;
const industries=new Set(["food","textile","pharma","chemical","supermarket"]);
const API=(location.hostname==="localhost"||location.hostname==="127.0.0.1"?"http://localhost:10000":"https://mydempire-backend-1.onrender.com")+"/api/industrial-investment";
const SCALE=1000000n,PRICE_SCALE=100000000n;
function micro(value){
 if(typeof value!=="string"||!/^(0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value))throw Error("Invalid decimal");
 const [whole,frac=""]=value.split(".");
 return BigInt(whole)*SCALE+BigInt(frac.padEnd(6,"0"));
}
function priceMicro(value){
 if(typeof value!=="string"||!/^(0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/.test(value))throw Error("Invalid market price");
 const [whole,frac=""]=value.split(".");return BigInt(whole)*PRICE_SCALE+BigInt(frac.padEnd(8,"0"));
}
function format(n){return (n/SCALE)+"."+(n%SCALE).toString().padStart(6,"0");}
function init(){
 const form=document.getElementById("iibTradeForm");if(!form)return;
 const side=document.getElementById("iibTradeSide"),industry=document.getElementById("iibTradeIndustry");
 const amount=document.getElementById("iibTradeAmount"),label=document.getElementById("iibTradeAmountLabel");
 const message=document.getElementById("iibTradeMessage"),submit=document.getElementById("iibTradeSubmit");
 const quote=document.getElementById("iibTradeQuote");
 let snapshot=null,requestId=0,busy=false;
 async function loadQuote(){
  const current=++requestId;snapshot=null;quote.textContent="Checking latest published price…";
  const token=window.MDEAuth?.getToken();
  if(!token){quote.textContent="Sign in to view published prices.";return;}
  try{
   const response=await fetch(API+"/quotes",{headers:{"Accept":"application/json","Authorization":"Bearer "+token},cache:"no-store"});
   const result=await response.json();
   if(current!==requestId)return;
   if(!response.ok||result.success!==true||result.active!==true||
      !Array.isArray(result.quotes)||result.quotes.length!==industries.size||
      new Set(result.quotes.map(q=>q.industry)).size!==industries.size||
      !result.quotes.every(q=>industries.has(q.industry)&&
       Number(q.settlement_index)===Number(result.settlementIndex)&&
       Date.parse(q.settlement_at)===Date.parse(result.settlementAt)&&
       typeof q.next_price==="string"&&priceMicro(q.next_price)>0n)||
      !Number.isFinite(Date.parse(result.settlementAt))||
      Date.parse(result.settlementAt)>Date.now()||
      Date.now()-Date.parse(result.settlementAt)>2*60*60*1000)
    throw Error("Unverified price board");
   snapshot=result;refresh();
  }catch(_){if(current===requestId){snapshot=null;quote.textContent="Verified price unavailable. No trade estimate shown.";}}
 }
 function refresh(){
  label.textContent=side.value==="BUY"?"IIC budget to spend":"Industry units to sell";
  submit.disabled=busy||!TRADING_RELEASE_APPROVED; // Server-side interlocks independently deny unreleased trading.
  let n;
  try{n=micro(amount.value.trim());if(n<=0n)throw Error("Nonpositive");}
  catch(_){message.textContent="Enter a positive amount with up to six decimal places.";quote.textContent=snapshot?"Enter an amount to estimate.":"Verified price unavailable.";return;}
  if(!industries.has(industry.value)||!["BUY","SELL"].includes(side.value))return;
  message.textContent=TRADING_RELEASE_APPROVED?"Review your trade before submitting.":"Preview only. No order can be submitted.";
  if(snapshot&&(Date.now()-Date.parse(snapshot.settlementAt)>2*60*60*1000||Date.parse(snapshot.settlementAt)>Date.now()))snapshot=null;
  if(!snapshot){quote.textContent="Verified fresh price unavailable. Refresh to check current prices.";return;}
  const row=snapshot.quotes.find(q=>q.industry===industry.value);
  const price=priceMicro(row.next_price);
  // Informational estimate only; no claim of executable quantity or final fee.
  const estimate=side.value==="BUY"?(n*PRICE_SCALE/price):(n*price/PRICE_SCALE);
  quote.textContent="Last published: "+row.next_price+" IIC/unit · Estimated "+
   (side.value==="BUY"?"units":"gross IIC")+": "+format(estimate)+
   " (before fees; not an executable quote)";
 }
 for(const control of [side,industry,amount])control.addEventListener("input",refresh);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)loadQuote();});
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!TRADING_RELEASE_APPROVED){message.textContent="Trading is not released. No order was submitted.";return;}
  if(busy||!snapshot){message.textContent="A verified price is required.";return;}
  const selectedSide=side.value,selectedIndustry=industry.value,value=amount.value.trim();
  try{
   if(!industries.has(selectedIndustry)||!["BUY","SELL"].includes(selectedSide)||micro(value)<=0n)
    throw Error("Invalid trade");
   if(Date.now()-Date.parse(snapshot.settlementAt)>=2*60*60*1000)throw Error("Price expired");
   const token=window.MDEAuth?.getToken();
   if(!token)throw Error("Sign in required");
   const requestKey="iib:"+crypto.randomUUID();
   const payload={industry:selectedIndustry,side:selectedSide,requestKey,
    ...(selectedSide==="BUY"?{budgetIic:value}:{unitsAmount:value})};
   busy=true;refresh();message.textContent="Submitting immediate trade…";
   const response=await fetch(API+"/trade",{method:"POST",headers:{
    "Content-Type":"application/json","Accept":"application/json","Authorization":"Bearer "+token
   },body:JSON.stringify(payload),cache:"no-store"});
   const result=await response.json();
   if(!response.ok||result.success!==true||!(result.filled===true||result.alreadyFilled===true))
    throw Error("Trade rejected by server");
   document.dispatchEvent(new Event("iib:portfolio-updated"));
   await loadQuote();
   message.textContent="Trade filled. Portfolio refresh requested.";
  }catch(_){message.textContent="Trade was not confirmed. Check your portfolio before retrying.";}
  finally{busy=false;refresh();}
 });
 refresh();loadQuote();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
