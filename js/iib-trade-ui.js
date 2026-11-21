(function(){
"use strict";
/**
 * Trading UI is a non-executing preview until a reviewed backend release.
 * Never send a POST, initiate a Hive transfer, or claim an order filled here.
 */
const industries=new Set(["food","textile","pharma","chemical","supermarket"]);
function init(){
 const form=document.getElementById("iibTradeForm");
 if(!form)return;
 const side=document.getElementById("iibTradeSide");
 const industry=document.getElementById("iibTradeIndustry");
 const amount=document.getElementById("iibTradeAmount");
 const label=document.getElementById("iibTradeAmountLabel");
 const message=document.getElementById("iibTradeMessage");
 const submit=document.getElementById("iibTradeSubmit");
 function refresh(){
  label.textContent=side.value==="BUY"?"IIC budget to spend":"Industry units to sell";
  const valid=industries.has(industry.value)&&["BUY","SELL"].includes(side.value)&&
   /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(amount.value.trim())&&
   Number(amount.value)>0;
  submit.disabled=true; // Deliberate release interlock; not a client-side toggle.
  message.textContent=valid
   ?"Trade prepared for "+industry.value+" ("+side.value+"). Execution is not yet enabled."
   :"Enter a positive amount with at most six decimal places.";
 }
 for(const control of [side,industry,amount])control.addEventListener("input",refresh);
 form.addEventListener("submit",event=>{
  event.preventDefault();
  message.textContent="Trading has not been released. No order was submitted.";
 });
 refresh();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
else init();
})();
