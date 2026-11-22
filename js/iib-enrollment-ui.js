(function(){
"use strict";
/** Enrollment is wired but cannot be activated until the reviewed release. */
const ENROLLMENT_RELEASE_APPROVED=false;
const API=(location.hostname==="localhost"||location.hostname==="127.0.0.1"?"http://localhost:10000":"https://mydempire-backend-1.onrender.com")+"/api/industrial-investment";
function init(){
 const button=document.getElementById("iibEnrollButton");
 const status=document.getElementById("iibEnrollmentStatus");
 if(!button||!status)return;
 button.disabled=!ENROLLMENT_RELEASE_APPROVED;
 let inFlight=false,attempted=false;
 async function enroll(){
  if(!ENROLLMENT_RELEASE_APPROVED||inFlight)return;
  inFlight=true;attempted=true;
  const token=window.MDEAuth?.getToken();
  if(!token){status.textContent="Sign in with Hive to enroll.";return;}
  button.disabled=true;status.textContent="Checking weekly enrollment…";
  try{
   const response=await fetch(API+"/enroll",{method:"POST",headers:{
    "Accept":"application/json","Content-Type":"application/json",
    "Authorization":"Bearer "+token
   },body:"{}",cache:"no-store"});
   const result=await response.json();
   if(!response.ok||result.success!==true||!Number.isSafeInteger(Number(result.playerWeekId)))
    throw Error("Enrollment not confirmed");
   status.textContent="Enrolled for this week. Your IIC portfolio is refreshing.";
   document.dispatchEvent(new Event("iib:portfolio-updated"));
  }catch(_){status.textContent="Enrollment was not confirmed. Please check your portfolio.";}
  finally{inFlight=false;button.disabled=!ENROLLMENT_RELEASE_APPROVED;}
 }
 button.addEventListener("click",enroll);
 // Auto-enroll on the first eligible dashboard visit of each week.
 // The backend grants only once per player/week, even across devices or retries.
 document.addEventListener("iib:eligibility-loaded",event=>{
  if(ENROLLMENT_RELEASE_APPROVED&&!attempted&&event.detail?.eligible===true&&event.detail?.active===true)
   void enroll();
 });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
