(function(){
'use strict';
const base=(location.hostname==='localhost'||location.hostname==='127.0.0.1'?'http://localhost:10000':'https://mydempire-backend-1.onrender.com')+'/api/iib/v2';
const ids=['food','textile','pharma','chemical','supermarket'];
const labels={food:'🌾 Food',textile:'🧵 Textile',pharma:'💊 Pharma',chemical:'⚗️ Chemical',supermarket:'🛒 Supermarket'};
const el=id=>document.getElementById(id);
const state={active:false,weekId:null,account:null,prices:{},purchase:null,busy:false,separateFree:false,freePosition:null,positions:[],dashboardPrices:{}};
function username(){return window.MDEAuth?.getUsername()||'';}
function key(kind){return 'myd_iib_'+kind+'_'+username();}
function message(text,error){el('message').textContent=text;el('message').className=error?'error':'ok';}
function micro(value){
 if(typeof value!=='string'||!/^\d+$/.test(value))return '—';
 const rounded=(BigInt(value)+500n)/1000n;return (rounded/1000n).toString()+'.'+(rounded%1000n).toString().padStart(3,'0').replace(/0+$/,'').padEnd(2,'0');
}
function exactMicro(n){return (n/1000000n).toString()+'.'+(n%1000000n).toString().padStart(6,'0');}
function maxWithdraw(){const p=state.positions.find(p=>p.industry===el('industry').value),q=state.dashboardPrices[el('industry').value];return p&&q?BigInt(p.unitsMicro)*BigInt(q.priceMicro)/1000000n:0n;}
async function api(path,options={}){
 const response=await fetch(base+path,{cache:'no-store',...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.success!==true){const error=Error(data.error||'IIB service unavailable');error.status=response.status;throw error;}
 return data;
}
function render(){
 const root=el('prices');root.replaceChildren();
 for(const id of ids){
  const box=document.createElement('div');box.className='sector';
  const title=document.createElement('strong');title.textContent=labels[id];
  const price=document.createElement('span');price.textContent=state.prices[id]?((Number(state.prices[id].priceMicro)/100000000-1)*100).toFixed(2)+'% this week':'Awaiting update';
  box.append(title,price);root.append(box);
 }
 const signed=!!username(),ready=state.active&&signed&&!state.busy;
 el('loginStatus').textContent=signed?'Signed in as @'+username():'Sign in with Hive Keychain to invest.';
 el('boardSignIn').hidden=signed;
 el('boardSignIn').disabled=state.busy;
 el('enroll').disabled=!ready||!!state.account;
 el('buy').disabled=!ready||!state.account;
 el('sell').disabled=!ready||!state.account;
 el('maxInvest').disabled=!ready||!state.account||BigInt(state.account.cashMicro||'0')===0n;
 el('maxWithdraw').disabled=!ready||!state.account||maxWithdraw()===0n;
 el('investFree').disabled=!ready||!state.account||!state.separateFree||!!state.freePosition||String(state.account.freeGrantMicro)!=='1000000000';
 el('investFree').hidden=!state.separateFree;
 el('purchase').disabled=!ready||!state.purchase?.enabled||!!localStorage.getItem(key('payment'));
 el('claim').disabled=!signed||state.busy;
 el('retryTrade').hidden=!signed||!sessionStorage.getItem(key('order'));
 const selected=state.prices[el('industry').value];
 el('quote').textContent=selected?'Industry change this week: '+((Number(selected.priceMicro)/100000000-1)*100).toFixed(2)+'%.':'No current market value.';
}
let leaderboardData=null,leaderboardPeriod='current';
function renderLeaderboard(){
 const current=leaderboardPeriod==='current',board=leaderboardData?.[leaderboardPeriod],rows=el('leaderboardRows');rows.replaceChildren();
 el('leaderboardCurrent').setAttribute('aria-pressed',String(current));
 el('leaderboardPrevious').setAttribute('aria-pressed',String(!current));
 if(!board||!board.players.length){el('leaderboardStatus').textContent=current?'No eligible participants yet this week.':'No settled results available for the previous week.';return;}
 el('leaderboardStatus').textContent=(current?'Estimated rewards':'Final rewards')+' · Week ending '+new Date(board.week.endsAt).toUTCString();
 board.players.forEach((player,index)=>{
  const tr=document.createElement('tr');
  const values=[String(index+1),'@'+player.username,micro(player.rewardMicro)+' EMP',player.returnPercent===null?'—':(Number(player.returnPercent)>0?'+':'')+player.returnPercent+'%'];
  for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}
  rows.append(tr);
 });
}
async function refreshLeaderboard(){
 try{leaderboardData=await api('/leaderboard');renderLeaderboard();}
 catch(_){el('leaderboardRows').replaceChildren();el('leaderboardStatus').textContent='Leaderboard unavailable. Please refresh.';}
}
el('leaderboardCurrent').onclick=()=>{leaderboardPeriod='current';renderLeaderboard();};
el('leaderboardPrevious').onclick=()=>{leaderboardPeriod='previous';renderLeaderboard();};
async function refresh(){
 void refreshLeaderboard();
 try{
  const market=await api('/market');
  state.active=market.active===true;state.weekId=market.week?.id||null;
  state.prices=Object.fromEntries((market.prices||[]).filter(p=>ids.includes(p.industry)).map(p=>[p.industry,p]));
  el('status').textContent=state.active?'Market open':'The market is not currently open.';
  el('week').textContent=market.week?'Week ends '+new Date(market.week.endsAt).toUTCString():'';
 }catch(e){state.active=false;state.prices={};el('status').textContent='Market data unavailable.';}
 try{state.purchase=await api('/purchase-options');}catch(e){state.purchase=null;}
 state.account=null;state.positions=[];state.dashboardPrices={};el('holdings').replaceChildren();
 el('liveProfit').hidden=true;el('liveProfit').textContent='';
 if(username()){
  try{
   const data=await api('/dashboard');const d=data.dashboard;state.account=d?.account||null;state.separateFree=!!d?.separateFree;state.freePosition=d?.freePosition||null;state.positions=d?.positions||[];state.dashboardPrices=Object.fromEntries((d?.prices||[]).map(p=>[p.industry,p]));
   const freeBox=el('freePosition');freeBox.hidden=!state.separateFree;if(state.separateFree)freeBox.textContent=state.freePosition?'Free investment: '+(labels[state.freePosition.industry]||state.freePosition.industry)+' · '+micro(state.freePosition.valueMicro)+' IIC · '+micro(state.freePosition.rewardMicro)+' EMP estimated · locked until reset':'Free IIC: '+(state.account?.freeGrantMicro==='1000000000'?'1,000 available to invest in one industry':'not yet allocated');
   el('account').textContent=state.account?'Available: '+micro(String(state.account.cashMicro))+' IIC':'No IIB account for this week yet.';
   if(d?.active&&state.account&&Array.isArray(d.positions)&&Array.isArray(d.prices)){
    try{
     const whole=value=>{if(typeof value!=='string'||!/^[0-9]+$/.test(value))throw Error('Missing balance');return BigInt(value);};
     let total=whole(state.account.cashMicro);
     const baseline=(d.separateFree?0n:whole(state.account.freeGrantMicro))+whole(state.account.contributedMicro)+whole(state.account.carriedForwardMicro);
     const quoteMap=new Map(d.prices.map(p=>[p.industry,p]));
     for(const p of d.positions){
      const units=whole(p.unitsMicro);
      if(units===0n)continue;
      const quote=quoteMap.get(p.industry);
      if(!quote)throw Error('Missing market value');
      const price=whole(quote.priceMicro);
      if(price===0n)throw Error('Invalid market value');
      total+=units*price/1000000n;
     }
     const profit=total-baseline;
     if(!Array.isArray(d.industryResults))throw Error('Industry results unavailable');
     let loss=d.industryResults.reduce((sum,r)=>{if(!/^-?[0-9]+$/.test(r.profitMicro))throw Error('Invalid industry result');const n=BigInt(r.profitMicro);return n<0n?sum-n:sum;},0n);
     if(d.freePosition){const n=BigInt(d.freePosition.profitMicro);if(n<0n)loss-=n;}
     const box=el('liveProfit');box.replaceChildren();
     const title=document.createElement('strong');
     title.textContent='Loss in losing investments: '+micro(loss.toString())+' IIC';
     title.className=loss>0n?'error':'ok';
     const details=document.createElement('div');
     if(!Array.isArray(d.industryResults)||typeof d.estimatedEmpRewardMicro!=='string')throw Error('Industry results unavailable');
     details.textContent=(d.separateFree?'Purchased IIC current value: ':'Total value: ')+micro(total.toString())+' IIC';
     const reward=document.createElement('strong');reward.className='iib-reward';reward.textContent='Estimated EMP reward: '+micro(d.estimatedEmpRewardMicro)+' EMP';
     const sectors=document.createElement('div');
     for(const result of d.industryResults.filter(r=>r.active)){
      if(!/^-?[0-9]+$/.test(result.profitMicro)||!/^\d+$/.test(result.rewardMicro))throw Error('Invalid industry result');
      const amount=BigInt(result.profitMicro),line=document.createElement('div');
      line.className=amount<0n?'error':'ok';
      line.textContent=(labels[result.industry]||result.industry)+': '+(amount>0n?'+':amount<0n?'-':'')+micro((amount<0n?-amount:amount).toString())+' IIC · '+micro(result.rewardMicro)+' EMP';
      sectors.append(line);
     }
     const hint=document.createElement('small');
     hint.textContent='Each profitable industry earns EMP independently. Estimates use the latest published values; the final reward is calculated at the weekly reset.';
     box.append(reward,title,details,sectors,hint);box.hidden=false;
    }catch(_){
     const box=el('liveProfit');box.textContent='Weekly profit / loss is unavailable until all investment values load.';box.hidden=false;
    }
   }
   for(const position of d?.positions||[]){
    const row=document.createElement('div');row.className='row';
    const title=document.createElement('span');title.textContent=labels[position.industry]||position.industry;
    const value=document.createElement('strong');const quote=state.prices[position.industry];
    const investmentValue=quote?(BigInt(position.unitsMicro)*BigInt(quote.priceMicro)/1000000n).toString():null;
    value.textContent=investmentValue!==null?micro(investmentValue)+' IIC current value':'Value unavailable';
    row.append(title,value);el('holdings').append(row);
   }
  }catch(e){el('account').textContent='Account unavailable. Please refresh.';}
  const pending=localStorage.getItem(key('payment'));if(pending&&pending!=='unknown')el('txid').value=pending;
 }else el('account').textContent='Sign in to view your IIC and holdings.';
 render();
}
async function run(fn){if(state.busy)return;state.busy=true;render();try{await fn();}catch(e){message(e.message||'Request failed.',true);}finally{state.busy=false;render();}}
el('maxInvest').onclick=()=>{if(state.account)el('units').value=exactMicro(BigInt(state.account.cashMicro));};
el('maxWithdraw').onclick=()=>{el('units').value=exactMicro(maxWithdraw());};
el('refresh').onclick=()=>run(refresh);
el('industry').onchange=render;
el('enroll').onclick=()=>run(async()=>{await api('/enroll',{method:'POST',body:'{}'});message('Enrollment complete.');await refresh();});
async function sendOrder(order){
 await api('/trade',{method:'POST',body:JSON.stringify(order)});
 sessionStorage.removeItem(key('order'));message('Order completed.');await refresh();
}
function order(side){return run(async()=>{
 if(sessionStorage.getItem(key('order')))throw Error('Retry the pending order before placing another one.');
 const amount=el('units').value.trim();
 if(!/^(0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(amount)||Number(amount)<=0)throw Error('Enter a positive IIC amount, up to six decimal places.');
 if(side==='BUY'&&Number(amount)<1000)throw Error('Minimum investment is 1,000 IIC.');
 if(!crypto.randomUUID)throw Error('Secure order IDs are unavailable in this browser.');
 const order={industry:el('industry').value,side,amount,clientOrderId:crypto.randomUUID()};
 sessionStorage.setItem(key('order'),JSON.stringify({weekId:state.weekId,order}));
 try{await sendOrder(order);}catch(e){if(e.status===400||e.status===403)sessionStorage.removeItem(key('order'));message(e.message+(e.status===400||e.status===403?'':' If the result is uncertain, retry the same order.'),true);}
});}
el('investFree').onclick=()=>run(async()=>{await api('/free-investment',{method:'POST',body:JSON.stringify({industry:el('industry').value})});message('Free investment locked until the weekly reset.');await refresh();});
el('buy').onclick=()=>order('BUY');el('sell').onclick=()=>order('SELL');
el('retryTrade').onclick=()=>run(async()=>{const pending=sessionStorage.getItem(key('order'));if(!pending)throw Error('No pending order.');const saved=JSON.parse(pending);if(!state.weekId||saved.weekId!==state.weekId)throw Error('This pending order belongs to an earlier week; contact support before placing another order.');await sendOrder(saved.order);});
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
 const eligibility=await api('/hive-purchase/eligibility');
 if(eligibility.eligible!==true)throw Error('You need at least 1,000 EP/day and an open IIB week to purchase IIC.');
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
// Both login buttons use a signed Hive session and stay on this board.
async function connectBoardWallet(){
 if(state.busy)return;
 const suggested=new URLSearchParams(location.search).get('user')||localStorage.getItem('mde_username')||'';
 const entered=prompt('Enter your Hive username to connect:',suggested);
 if(entered===null)return;
 const name=entered.trim().replace(/^@/,'').toLowerCase();
 if(!name){message('Enter your Hive username.',true);return;}
 state.busy=true;render();
 try{
  await window.MDEAuth.signIn(name);
  // Drop any username query parameter; authentication uses the signed session.
  location.replace('iib-player-board.html');
 }catch(error){message(error.message||'Unable to sign in.',true);}
 finally{state.busy=false;render();}
}
document.getElementById('boardSignIn').addEventListener('click',connectBoardWallet);
const loginButton=document.getElementById('appbarLoginBtn');
if(loginButton)loginButton.addEventListener('click',connectBoardWallet);
refresh();setInterval(refresh,60000);
})();
