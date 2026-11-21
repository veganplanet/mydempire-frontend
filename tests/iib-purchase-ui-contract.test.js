"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const js=fs.readFileSync(path.join(__dirname,"../js/iib-purchase-ui.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../industrial-investment-board.html"),"utf8");
test("Hive purchase is present but hard-disabled before release",()=>{
 assert.match(html,/id="iibPurchaseForm"/);
 assert.match(html,/id="iibPurchaseSubmit"[^>]*disabled/);
 assert.match(html,/js\/iib-purchase-ui\.js/);
 assert.match(js,/const PURCHASE_RELEASE_APPROVED=false/);
 assert.match(js,/if\(!PURCHASE_RELEASE_APPROVED\|\|busy\)return/);
});
test("purchase confirmation uses signed player session and chain locators only",()=>{
 assert.match(js,/fetch\(API\+"\/purchase"/);
 assert.match(js,/Authorization":"Bearer "\+token/);
 assert.match(js,/JSON\.stringify\(\{blockNumber,txId,operationIndex\}\)/);
 assert.doesNotMatch(js,/requestTransfer|requestBroadcast|privateKey|activeKey/);
 assert.match(js,/iib:portfolio-updated/);
});
