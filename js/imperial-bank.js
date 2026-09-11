(function () {
  "use strict";

  const API_PRODUCTION = "https://mydempire-backend-1.onrender.com";
  let bankState = null;
  let requestInProgress = false;

  function getApiBase() {
    return ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "http://localhost:10000"
      : API_PRODUCTION;
  }

  function cleanUsername(value) {
    return String(value || "").trim().replace(/^@/, "").toLowerCase();
  }

  function getLoggedInUsername() {
    return cleanUsername(
      localStorage.getItem("hiveUsername") ||
        localStorage.getItem("mde_username") ||
        localStorage.getItem("username") ||
        "",
    );
  }

  function getViewedUsername() {
    const params = new URLSearchParams(window.location.search);
    return cleanUsername(
      params.get("user") || params.get("view") || getLoggedInUsername(),
    );
  }

  function isOwnerView() {
    const viewed = getViewedUsername();
    const loggedIn = getLoggedInUsername();
    return Boolean(viewed && loggedIn && viewed === loggedIn);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function number(value) {
    return Number(value || 0).toLocaleString(undefined, {
      maximumFractionDigits: 3,
    });
  }

  function formatDate(value, includeTime = true) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(includeTime
        ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }
        : {}),
    });
  }

  function rewardIcon(type) {
    const key = String(type || "").toUpperCase();
    if (key === "EMP") return "🪙";
    if (key === "AP") return "🎯";
    if (key === "SMP") return "🔷";
    if (key === "IMPERIAL_FRAGMENT") return "🧩";
    if (key === "TICKET") return "🎟️";
    if (key === "IMPERIAL_MINT_BLUEPRINT") return "🏛️";
    return "📜";
  }

  function injectStyles() {
    if (document.getElementById("imperial-bank-styles")) return;
    const style = document.createElement("style");
    style.id = "imperial-bank-styles";
    style.textContent = `
      #imperial-bank-root { --bank-navy:#102a56; --bank-blue:#1d4ed8; --bank-gold:#d59b22; color:#172033; }
      .ib-hero { position:relative; overflow:hidden; padding:28px; border-radius:22px; color:#fff; background:linear-gradient(135deg,#102a56 0%,#1d4ed8 68%,#b7791f 140%); box-shadow:0 16px 34px rgba(16,42,86,.18); }
      .ib-hero:after { content:"🏦"; position:absolute; right:28px; top:8px; font-size:96px; opacity:.10; }
      .ib-hero h2 { margin:0 0 8px; font-size:30px; color:#ffffff !important; }
      .ib-hero p { margin:0; max-width:760px; line-height:1.55; color:#dbeafe; font-weight:650; }
      .ib-pill { display:inline-flex; margin-top:15px; padding:7px 12px; border-radius:999px; background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.28); font-weight:850; }
      .ib-alert { margin:16px 0; padding:13px 16px; border-radius:13px; font-weight:750; line-height:1.45; }
      .ib-alert-info { background:#eff6ff; border:1px solid #bfdbfe; color:#1e3a8a; }
      .ib-alert-warning { background:#fffbeb; border:1px solid #fde68a; color:#854d0e; }
      .ib-alert-error { background:#fff1f2; border:1px solid #fecdd3; color:#9f1239; }
      .ib-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin:18px 0; }
      .ib-stat { padding:17px; background:#fff; border:1px solid #dbe4f0; border-radius:16px; box-shadow:0 7px 18px rgba(15,23,42,.06); }
      .ib-stat-label { color:#64748b; font-size:12px; font-weight:900; letter-spacing:.055em; text-transform:uppercase; }
      .ib-stat-value { margin-top:7px; color:#102a56; font-size:23px; font-weight:950; }
      .ib-layout { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr); gap:18px; }
      .ib-card { padding:21px; background:#fff; border:1px solid #dbe4f0; border-radius:18px; box-shadow:0 8px 22px rgba(15,23,42,.06); }
      .ib-card h3 { margin:0 0 8px; color:#102a56; font-size:20px; }
      .ib-muted { color:#64748b; line-height:1.5; }
      .ib-options { display:flex; flex-wrap:wrap; gap:9px; margin:17px 0; }
      .ib-option { padding:10px 14px; border:2px solid #dbe4f0; border-radius:12px; background:#fff; color:#334155; font-weight:900; cursor:pointer; }
      .ib-option:hover,.ib-option.selected { border-color:#d59b22; background:#fffbeb; color:#854d0e; }
      .ib-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:17px; }
      .ib-btn { min-height:44px; padding:11px 17px; border:0; border-radius:12px; color:#fff; font-weight:900; cursor:pointer; box-shadow:0 5px 12px rgba(15,23,42,.12); }
      .ib-btn-primary { background:linear-gradient(135deg,#1d4ed8,#173a75); }
      .ib-btn-gold { background:linear-gradient(135deg,#e2ad38,#a8640c); }
      .ib-btn-danger { background:#b42336; }
      .ib-btn:disabled { cursor:not-allowed; opacity:.48; box-shadow:none; }
      .ib-progress { height:13px; margin:16px 0 7px; overflow:hidden; border-radius:999px; background:#e8eef7; }
      .ib-progress span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#d59b22,#f7cf66); }
      .ib-cycle-meta { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:15px; }
      .ib-meta { padding:12px; border-radius:12px; background:#f8fafc; }
      .ib-meta strong { display:block; margin-top:4px; color:#172554; }
      .ib-rules { margin:13px 0 0; padding-left:20px; color:#475569; line-height:1.65; }
      .ib-history { margin-top:18px; }
      .ib-history-list { display:grid; gap:9px; max-height:390px; overflow:auto; }
      .ib-history-row { display:grid; grid-template-columns:42px 1fr auto; align-items:center; gap:10px; padding:12px; border:1px solid #e2e8f0; border-radius:12px; background:#fbfdff; }
      .ib-history-icon { display:grid; place-items:center; width:38px; height:38px; border-radius:10px; background:#eff6ff; font-size:20px; }
      .ib-history-title { font-weight:900; color:#1e293b; }
      .ib-history-date { margin-top:3px; color:#64748b; font-size:12px; }
      .ib-history-number { color:#1d4ed8; font-weight:900; }
      @media(max-width:900px){ .ib-grid{grid-template-columns:repeat(2,1fr)} .ib-layout{grid-template-columns:1fr} }
      @media(max-width:520px){ .ib-hero{padding:21px} .ib-hero h2{font-size:25px} .ib-grid{grid-template-columns:1fr 1fr;gap:9px} .ib-stat{padding:13px} .ib-stat-value{font-size:18px} .ib-cycle-meta{grid-template-columns:1fr} .ib-btn{width:100%} }
    `;
    document.head.appendChild(style);
  }

  function setContent(html) {
    const content = document.getElementById("imperial-bank-content");
    if (content) content.innerHTML = html;
  }

  function renderLoading() {
    setContent('<div class="ib-alert ib-alert-info">Loading Imperial Bank...</div>');
  }

  function renderError(message) {
    setContent(`<div class="ib-alert ib-alert-error">${escapeHtml(message)}</div>`);
  }

  function renderHistory(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return '<div class="ib-muted">No Treasury Draw history yet.</div>';
    }
    return `<div class="ib-history-list">${rows
      .map(
        (row) => `
          <div class="ib-history-row">
            <div class="ib-history-icon">${rewardIcon(row.reward_type)}</div>
            <div>
              <div class="ib-history-title">${escapeHtml(row.reward_label || "Treasury Draw")}</div>
              <div class="ib-history-date">${escapeHtml(formatDate(row.created_at))}</div>
            </div>
            <div class="ib-history-number">Draw #${number(row.draw_number)}</div>
          </div>`,
      )
      .join("")}</div>`;
  }

  function renderState(state) {
    bankState = state;
    const config = state.config || {};
    const enabled = Boolean(config.enabled);
    const deposit = config.deposit || {};
    const cycleConfig = config.cycle || {};
    const cycle = state.cycle;
    const active = state.activeCycle;
    const owner = isOwnerView();
    const allowed = Array.isArray(deposit.allowedAmounts)
      ? deposit.allowedAmounts
      : [1000, 2000, 3000, 4000, 5000];
    const defaultAmount = allowed[0] || 1000;
    const totalDraws = Number(active?.total_draws || cycleConfig.totalDraws || 10);
    const used = Number(state.drawsConsumed || 0);
    const remaining = Number(state.drawsRemaining || 0);
    const progress = totalDraws ? Math.min(100, (used / totalDraws) * 100) : 0;
    const bankEmp = Number(state.balances?.bankEmp || 0);
    const liquidEmp = Number(state.balances?.liquidEmp || 0);
    const canStart = enabled && owner && !active && !state.cooldownActive;
    const canDraw = enabled && owner && Boolean(state.todayDrawAvailable);
    const canWithdraw = owner && bankEmp > 0;

    let notice = "";
    if (!enabled) {
      notice = '<div class="ib-alert ib-alert-warning">The Imperial Bank is currently paused. New deposits and Treasury Draws are unavailable, but banked EMP can still be withdrawn.</div>';
    } else if (!owner) {
      notice = '<div class="ib-alert ib-alert-info">Visitor view: Imperial Bank actions are available only to the account owner.</div>';
    } else if (state.todayUsed && active) {
      notice = '<div class="ib-alert ib-alert-info">Today\'s Treasury Draw is complete. Your next draw becomes available after 00:00 UTC.</div>';
    } else if (!active && state.cooldownActive) {
      notice = `<div class="ib-alert ib-alert-warning">This Treasury Cycle has ended or was withdrawn. A new cycle can start after ${escapeHtml(formatDate(state.nextCycleAt))}.</div>`;
    }

    const cycleBody = active
      ? `
        <h3>Active Treasury Cycle</h3>
        <div class="ib-muted">Your deposited EMP remains withdrawable at any time.</div>
        <div class="ib-progress"><span style="width:${progress}%"></span></div>
        <div class="ib-muted">${used} of ${totalDraws} draws consumed</div>
        <div class="ib-cycle-meta">
          <div class="ib-meta">Next draw<strong>${state.todayDrawAvailable ? `Draw #${number(state.nextDrawNumber)} available now` : "After 00:00 UTC"}</strong></div>
          <div class="ib-meta">Cycle ends<strong>${escapeHtml(formatDate(active.ends_at))}</strong></div>
        </div>
        <div class="ib-actions">
          <button id="ib-draw-btn" class="ib-btn ib-btn-gold" ${canDraw ? "" : "disabled"}>🎁 Make Treasury Draw</button>
          <button id="ib-withdraw-btn" class="ib-btn ib-btn-danger" ${canWithdraw ? "" : "disabled"}>Withdraw ${number(bankEmp)} EMP</button>
        </div>`
      : `
        <h3>Start a Treasury Cycle</h3>
        <div class="ib-muted">Choose an EMP deposit. Every deposit receives 10 draws; EMP rewards scale with the deposited amount.</div>
        <div class="ib-options" id="ib-deposit-options">
          ${allowed.map((amount, index) => `<button type="button" class="ib-option${index === 0 ? " selected" : ""}" data-amount="${Number(amount)}">${number(amount)} EMP</button>`).join("")}
        </div>
        <div class="ib-muted">Available liquid balance: <strong>${number(liquidEmp)} EMP</strong></div>
        <div class="ib-actions">
          <button id="ib-start-btn" class="ib-btn ib-btn-primary" data-amount="${Number(defaultAmount)}" ${canStart ? "" : "disabled"}>Start 14-Day Cycle</button>
          ${canWithdraw ? `<button id="ib-withdraw-btn" class="ib-btn ib-btn-danger">Withdraw ${number(bankEmp)} EMP</button>` : ""}
        </div>`;

    setContent(`
      <div class="ib-hero">
        <h2>Imperial Bank</h2>
        <p>Temporarily place unused EMP in the Imperial Treasury and unlock 10 progressive reward draws across a 14-day UTC cycle.</p>
        <span class="ib-pill">Treasury Draw • No APY • No fixed interest</span>
      </div>
      ${notice}
      <div id="ib-action-message"></div>
      <div class="ib-grid">
        <div class="ib-stat"><div class="ib-stat-label">Liquid EMP</div><div class="ib-stat-value">${number(liquidEmp)}</div></div>
        <div class="ib-stat"><div class="ib-stat-label">Banked EMP</div><div class="ib-stat-value">${number(bankEmp)}</div></div>
        <div class="ib-stat"><div class="ib-stat-label">Draws Remaining</div><div class="ib-stat-value">${active ? remaining : "--"}</div></div>
        <div class="ib-stat"><div class="ib-stat-label">Cycle Status</div><div class="ib-stat-value">${escapeHtml(active ? "Active" : state.cooldownActive ? "Cooldown" : "Ready")}</div></div>
      </div>
      <div class="ib-layout">
        <div class="ib-card">${cycleBody}</div>
        <div class="ib-card">
          <h3>How it works</h3>
          <ul class="ib-rules">
            <li>Deposit ${number(deposit.minimumEmp || 1000)}–${number(deposit.maximumEmp || 5000)} EMP.</li>
            <li>Receive ${number(cycleConfig.totalDraws || 10)} draws across ${number(cycleConfig.durationUtcDays || 14)} UTC days.</li>
            <li>Maximum one draw per UTC day.</li>
            <li>Missed days do not add extra daily draws.</li>
            <li>Withdraw anytime, but unused draws are forfeited.</li>
            <li>The original 14-day window still controls when another cycle may begin.</li>
          </ul>
        </div>
      </div>
      <div class="ib-card ib-history">
        <h3>Recent Treasury Draws</h3>
        ${renderHistory(state.recentDraws)}
      </div>`);

    bindControls();
  }

  function showActionMessage(message, type = "info") {
    const box = document.getElementById("ib-action-message");
    if (!box) return;
    box.innerHTML = `<div class="ib-alert ib-alert-${type}">${escapeHtml(message)}</div>`;
  }

  function setButtonsDisabled(disabled) {
    document
      .querySelectorAll("#imperial-bank-content button")
      .forEach((button) => (button.disabled = disabled));
  }

  async function postAction(action, body = {}) {
    if (requestInProgress) return null;
    const username = getViewedUsername();
    const actor = getLoggedInUsername();
    if (!username || !actor || username !== actor) {
      throw new Error("Only the logged-in account owner can use Imperial Bank actions.");
    }

    requestInProgress = true;
    setButtonsDisabled(true);
    try {
      const response = await fetch(
        `${getApiBase()}/player/${encodeURIComponent(username)}/imperial-bank/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mde-actor": actor,
          },
          body: JSON.stringify({ username, ...body }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Imperial Bank ${action} failed.`);
      }
      return data;
    } finally {
      requestInProgress = false;
    }
  }

  async function startCycle(amount) {
    if (!window.confirm(`Deposit ${number(amount)} EMP and start a 14-day Treasury Cycle?`)) return;
    try {
      showActionMessage("Starting your Treasury Cycle...");
      await postAction("start", { amount: Number(amount) });
      await loadImperialBankState();
      showActionMessage(`Treasury Cycle started with ${number(amount)} EMP.`, "info");
    } catch (error) {
      showActionMessage(error.message || "Unable to start Treasury Cycle.", "error");
      if (bankState) bindControls();
    }
  }

  async function makeDraw() {
    try {
      showActionMessage("Opening the Imperial Treasury...");
      const result = await postAction("draw");
      await loadImperialBankState();
      const label = result?.draw?.reward_label || result?.reward?.type || "Treasury Draw complete";
      showActionMessage(`🎉 ${label}`, "info");
    } catch (error) {
      showActionMessage(error.message || "Treasury Draw failed.", "error");
      if (bankState) bindControls();
    }
  }

  async function withdraw() {
    const bankEmp = Number(bankState?.balances?.bankEmp || 0);
    const remaining = Number(bankState?.drawsRemaining || 0);
    const warning = remaining > 0
      ? `Withdraw ${number(bankEmp)} EMP now? Your remaining ${remaining} Treasury Draw${remaining === 1 ? "" : "s"} will be permanently forfeited.`
      : `Withdraw ${number(bankEmp)} EMP from the Imperial Bank?`;
    if (!window.confirm(warning)) return;
    try {
      showActionMessage("Returning banked EMP to your liquid balance...");
      const result = await postAction("withdraw");
      await loadImperialBankState();
      showActionMessage(`${number(result.withdrawnEmp)} EMP withdrawn successfully.`, "info");
    } catch (error) {
      showActionMessage(error.message || "Withdrawal failed.", "error");
      if (bankState) bindControls();
    }
  }

  function bindControls() {
    const optionButtons = document.querySelectorAll(".ib-option");
    const startButton = document.getElementById("ib-start-btn");
    optionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        optionButtons.forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
        if (startButton) startButton.dataset.amount = button.dataset.amount;
      });
    });
    startButton?.addEventListener("click", () => startCycle(startButton.dataset.amount));
    document.getElementById("ib-draw-btn")?.addEventListener("click", makeDraw);
    document.getElementById("ib-withdraw-btn")?.addEventListener("click", withdraw);
  }

  async function loadImperialBankState() {
    injectStyles();
    const username = getViewedUsername();
    if (!username) {
      renderError("Please connect your Hive account to access Imperial Bank.");
      return;
    }
    renderLoading();
    try {
      const response = await fetch(
        `${getApiBase()}/player/${encodeURIComponent(username)}/imperial-bank`,
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load Imperial Bank.");
      }
      renderState(data);
    } catch (error) {
      console.error("Imperial Bank load failed:", error);
      renderError(error.message || "Failed to load Imperial Bank.");
    }
  }

  window.loadImperialBankState = loadImperialBankState;
})();
