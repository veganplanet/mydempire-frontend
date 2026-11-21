(function(){
"use strict";
/** Confirm an independently finalized Hive transfer; no client-side crediting. */
const PURCHASE_RELEASE_APPROVED=false;
const API=(location.hostname==="localhost"||location.hostname==="127.0.0.1"?"http://localhost:10000":"https://mydempire-backend-1.onrender.com")+"/api/industrial-investment";
function init(){
 const form=document.getElementById("iibPurchaseForm");
 if(!form)return;
 const button=document.getElementById("iibPurchaseSubmit");
 const status=document.getElementById("iibPurchaseStatus");
 const memo=document.getElementById("iibPurchaseMemo");
 let busy=false;
 button.disabled=!PURCHASE_RELEASE_APPROVED;
 // No transfer instruction is presented without a verified active week.
 async function loadInstructions(){
  if(!PURCHASE_RELEASE_APPROVED)return;
  const token=window.MDEAuth?.getToken();
  if(!token)return;
  try{
   const [weekResponse,portfolioResponse,eligibilityResponse]=await Promise.all([
    fetch(API+"/week",{headers:{"Authorization":"Bearer "+token},cache:"no-store"}),
    fetch(API+"/portfolio",{headers:{"Authorization":"Bearer "+token},cache:"no-store"}),
    fetch(API+"/eligibility",{headers:{"Authorization":"Bearer "+token},cache:"no-store"})
   ]);
   const week=await weekResponse.json(),portfolio=await portfolioResponse.json();
   const eligibility=await eligibilityResponse.json();
   const username=eligibility.username;
   if(!weekResponse.ok||!portfolioResponse.ok||!eligibilityResponse.ok||eligibility.success!==true||week.active!==true||
      portfolio.enrolled!==true||!Number.isSafeInteger(Number(week.week?.id))||
      Number(week.week.id)!==Number(portfolio.portfolio?.weekId)||
      typeof username!=="string"||!/^[a-z][a-z0-9.-]{2,15}$/.test(username))
    throw Error("Unverified enrollment");
   memo.textContent="Send HIVE to mydempire-vault with exact memo: iib:week:"+
    week.week.id+":"+username+" (1 HIVE = 1000 IIC). Confirm only after irreversible.";
  }catch(_){memo.textContent="Verified purchase instructions unavailable. Do not transfer HIVE.";}
 }
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!PURCHASE_RELEASE_APPROVED||busy)return;
  const token=window.MDEAuth?.getToken();
  const blockNumber=Number(document.getElementById("iibPurchaseBlock").value);
  const txId=document.getElementById("iibPurchaseTx").value.trim();
  const operationIndex=Number(document.getElementById("iibPurchaseOp").value);
  if(!token||!Number.isSafeInteger(blockNumber)||blockNumber<=0||
     !/^[a-f0-9]{40}$/i.test(txId)||!Number.isSafeInteger(operationIndex)||
     operationIndex<0||operationIndex>99){
   status.textContent="Enter a valid irreversible block, transaction ID and operation index.";return;
  }
  busy=true;button.disabled=true;status.textContent="Verifying Hive transfer on chain…";
  try{
   const response=await fetch(API+"/purchase",{method:"POST",headers:{
    "Content-Type":"application/json","Authorization":"Bearer "+token
   },body:JSON.stringify({blockNumber,txId,operationIndex}),cache:"no-store"});
   const result=await response.json();
   if(!response.ok||result.success!==true)throw Error("Unconfirmed");
   status.textContent="Hive transfer verified. Refreshing IIC portfolio.";
   document.dispatchEvent(new Event("iib:portfolio-updated"));
  }catch(_){status.textContent="Purchase not confirmed. Check transfer finality and your portfolio before retrying.";}
  finally{busy=false;button.disabled=!PURCHASE_RELEASE_APPROVED;}
 });
 void loadInstructions();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
