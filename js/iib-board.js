(function(){
'use strict';
const base=(location.hostname==='localhost'||location.hostname==='127.0.0.1'?'http://localhost:10000':'https://mydempire-backend-1.onrender.com')+'/api/iib/v2';
const ids=['food','textile','pharma','chemical','supermarket'];
const labels={food:'🌾 Food',textile:'🧵 Textile',pharma:'💊 Pharma',chemical:'⚗️ Chemical',supermarket:'🛒 Supermarket'};
const el=id=>document.getElementById(id);
const state={active:false,account:null,prices:{},purchase:null,busy:false};
function username(){return window.MDEAuth?.getUsername()||'';}
function key(kind){return 'myd_iib_'+kind+'_'+username();}
function message(text,error){el('message').textContent=text;el('message').className=error?'error':'ok';}
function micro(value){
 if(typeof value!=='string'||!/^\d+$/.test(value))return '—';
 const n=BigInt(value);return (n/1000000n).toString()+'.'+(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'').padEnd(1,'0');
}
async function api(path,options={}){
 const response=await fetch(base+path,{cache:'no-store',...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.success!==true)throw Error(data.error||'IIB service unavailable');
 return data;
}
function render(){
 const root=el('prices');root.replaceChildren();
 for(const id of ids){
  const box=document.createElement('div');box.className='sector';
  const title=document.createElement('strong');title.textContent=labels[id];
  const price=document.createElement('span');price.textContent=state.prices[id]?'IIC '+micro(String(state.prices[id].priceMicro)):'Awaiting price';
  box.append(title,price);root.append(box);
 }
 const signed=!!username(),ready=state.active&&signed&&!state.busy;
 el('enroll').disabled=!ready||!!state.account;
 el('buy').disabled=!ready||!state.account;
 el('sell').disabled=!ready||!state.account;
 el('purchase').disabled=!ready||!state.purchase?.enabled||!!localStorage.getItem(key('payment'));
 el('claim').disabled=!signed||state.busy;
 el('retryTrade').hidden=!signed||!sessionStorage.getItem(key('order'));
 const selected=state.prices[el('industry').value];
 el('quote').textContent=selected?'Last published price: '+micro(String(selected.priceMicro))+' IIC per unit.':'No current published price.';
}
async function refresh(){
 try{
  const market=await api('/market');
  state.active=market.active===true;
  state.prices=Object.fromEntries((market.prices||[]).filter(p=>ids.includes(p.industry)).map(p=>[p.industry,p]));
  el('status').textContent=state.active?'Market open':'The market is not currently open.';
  el('week').textContent=market.week?'Week ends '+new Date(market.week.endsAt).toUTCString():'';
 }catch(e){state.active=false;state.prices={};el('status').textContent='Market data unavailable.';}
 try{state.purchase=await api('/purchase-options');}catch(e){state.purchase=null;}
 state.account=null;el('holdings').replaceChildren();
 if(username()){
  try{
   const data=await api('/dashboard');const d=data.dashboard;state.account=d?.account||null;
   el('account').textContent=state.account?'Available: '+micro(String(state.account.cashMicro))+' IIC':'No IIB account for this week yet.';
   for(const position of d?.positions||[]){
    const row=document.createElement('div');row.className='row';
    const title=document.createElement('span');title.textContent=labels[position.industry]||position.industry;
    const value=document.createElement('strong');value.textContent=micro(String(position.unitsMicro))+' units';
    row.append(title,value);el('holdings').append(row);
   }
  }catch(e){el('account').textContent='Account unavailable. Please refresh.';}
  const pending=localStorage.getItem(key('payment'));if(pending&&pending!=='unknown')el('txid').value=pending;
 }else el('account').textContent='Sign in to view your IIC and holdings.';
 render();
}
async function run(fn){if(state.busy)return;state.busy=true;render();try{await fn();}catch(e){message(e.message||'Request failed.',true);}finally{state.busy=false;render();}}
el('refresh').onclick=()=>run(refresh);
el('industry').onchange=render;
el('enroll').onclick=()=>run(async()=>{await api('/enroll',{method:'POST',body:'{}'});message('Enrollment complete.');await refresh();});
async function sendOrder(order){
 await api('/trade',{method:'POST',body:JSON.stringify(order)});
 sessionStorage.removeItem(key('order'));message('Order completed.');await refresh();
}
function order(side){return run(async()=>{
 if(sessionStorage.getItem(key('order')))throw Error('Retry the pending order before placing another one.');
 const units=el('units').value.trim();
 if(!/^(0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(units)||Number(units)<=0)throw Error('Enter a positive number of units, up to six decimal places.');
 if(!crypto.randomUUID)throw Error('Secure order IDs are unavailable in this browser.');
 const order={industry:el('industry').value,side,units,clientOrderId:crypto.randomUUID()};
 sessionStorage.setItem(key('order'),JSON.stringify(order));
 try{await sendOrder(order);}catch(e){message(e.message+' If the result is uncertain, retry the same order.',true);}
});}
el('buy').onclick=()=>order('BUY');el('sell').onclick=()=>order('SELL');
el('retryTrade').onclick=()=>run(async()=>{const pending=sessionStorage.getItem(key('order'));if(!pending)throw Error('No pending order.');await sendOrder(JSON.parse(pending));});
async function claim(txId){
 if(!/^[a-f0-9]{40}$/.test(txId))throw Error('Enter a valid 40-character transaction ID.');
 await api('/hive-purchase/claim',{method:'POST',body:JSON.stringify({txId,operationIndex:0})});
 localStorage.removeItem(key('payment'));message('HIVE payment credited to your IIC account.');await refresh();
}
el('claim').onclick=()=>run(async()=>{await claim(el('txid').value.trim().toLowerCase());});
el('purchase').onclick=()=>run(async()=>{
 if(!window.hive_keychain)throw Error('Install or enable Hive Keychain first.');
 if(localStorage.getItem(key('payment')))throw Error('A previous payment needs to be credited first.');
 // Refresh server options immediately before opening the wallet.
 const options=await api('/purchase-options');
 if(!options.enabled||!options.recipient||options.memo!=='mydempire:iib'||options.iicPerHive!==1000)throw Error('HIVE purchases are unavailable.');
 const amount=Number(el('hiveAmount').value);
 if(!Number.isSafeInteger(amount)||amount<1||amount>100000)throw Error('Enter a positive whole HIVE amount.');
 localStorage.setItem(key('payment'),'unknown');
 let result;
 try{result=await new Promise(resolve=>window.hive_keychain.requestTransfer(username(),options.recipient,amount.toFixed(3),options.memo,'HIVE',resolve));}
 catch(e){throw Error('Wallet response unavailable. Check your wallet history before sending again.');}
 if(!result?.success){localStorage.removeItem(key('payment'));throw Error(result?.message||'Payment cancelled.');}
 const id=String(result.result?.id||result.result?.transaction_id||result.tx_id||result.transaction_id||'').toLowerCase();
 if(!/^[a-f0-9]{40}$/.test(id)){message('Payment sent. Enter its transaction ID below, then select Retry payment credit.',true);return;}
 localStorage.setItem(key('payment'),id);el('txid').value=id;
 try{await claim(id);}catch(e){message('Payment sent. Credit is pending: '+e.message+' Retry payment credit shortly.',true);}
});
refresh();setInterval(refresh,60000);
})();
