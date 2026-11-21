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
 assert.match(dashboard, /state\.active=week\.active===true&&week\.week\?\.status==="OPEN"/);
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
