"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const js=fs.readFileSync(path.join(__dirname,"../js/iib-trade-ui.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../industrial-investment-board.html"),"utf8");
test("trade ticket renders BUY and SELL but is visibly disabled",()=>{
 assert.match(html,/id="iibTradeForm"/);
 assert.match(html,/value="BUY"/);
 assert.match(html,/value="SELL"/);
 assert.match(html,/id="iibTradeSubmit"[^>]*disabled/);
 assert.match(html,/js\/iib-trade-ui\.js/);
});
test("trade ticket cannot issue POST requests or Hive transfers",()=>{
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|requestTransfer|requestBroadcast|\.submit\s*\(/);
 assert.match(js,/submit\.disabled=true/);
 assert.match(js,/event\.preventDefault\(\)/);
});

test("price preview handles eight decimal places and rejects stale snapshots",()=>{
 assert.match(js,/PRICE_SCALE=100000000n/);
 assert.match(js,/priceMicro\(row\.next_price\)/);
 assert.match(js,/n\*PRICE_SCALE\/price/);
 assert.match(js,/n\*price\/PRICE_SCALE/);
 assert.match(js,/Date\.now\(\)-Date\.parse\(result\.settlementAt\)>2\*60\*60\*1000/);
 assert.match(js,/submit\.disabled=true/);
});
