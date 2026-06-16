function isEmpireOperationsVisitorMode() {
  const params = new URLSearchParams(window.location.search);

  const viewedUser = params.get("user") || params.get("view") || "";

  const loggedInUser =
    localStorage.getItem("hiveUsername") ||
    localStorage.getItem("mde_username") ||
    localStorage.getItem("username") ||
    "";

  if (!viewedUser || !loggedInUser) return false;

  return viewedUser.toLowerCase() !== loggedInUser.toLowerCase();
}
async function loadEmpireOperations() {
  const area = document.getElementById("operations-live-area");

  try {
    const params = new URLSearchParams(window.location.search);

    const username =
      params.get("user") || params.get("view") || getLoggedInUser();

    if (!area) return;

    if (!username) {
      area.innerHTML = `<p class="status-text">Please connect wallet to view Empire Operations.</p>`;
      return;
    }

    if (!area.innerHTML.trim()) {
      area.innerHTML = `<p class="status-text">Loading Empire Operations...</p>`;
    }

    const [configResponse, playerResponse] = await Promise.all([
      fetch(`${API_BASE}/empire-operations/config`),
      fetch(`${API_BASE}/player/${username}/empire-operations`),
    ]);

    const configData = await configResponse.json();
    const playerData = await playerResponse.json();
    console.log("EMPIRE OPERATIONS PLAYER DATA:", playerData);

    if (!configData.success || !playerData.success) {
      throw new Error("Failed to load operations data.");
    }

    renderEmpireOperations(area, configData.operations, playerData);
  } catch (err) {
    console.error("Failed to load Empire Operations:", err);
    if (area) {
      if (area) {
        console.warn("Empire Operations temporary refresh skipped.");
      }
    }
  }
}
function getEmpireOperationStatusText(operation) {
  if (!operation) return "Preparing operation report...";

  const type = String(operation.operation_type || "").toUpperCase();
  const result = String(operation.planned_result || "").toUpperCase();
  const seed = Number(operation.narrative_seed || 0);

  const startedAt = new Date(operation.started_at).getTime();
  const endsAt = new Date(operation.ends_at).getTime();
  const now = Date.now();

  let progress = 0;

  if (
    Number.isFinite(startedAt) &&
    Number.isFinite(endsAt) &&
    endsAt > startedAt
  ) {
    progress = (now - startedAt) / (endsAt - startedAt);
  }

  let stage = "early";
  if (progress >= 0.66) stage = "late";
  else if (progress >= 0.33) stage = "mid";

  const pools = {
    LOCAL_SUPPLY: [
      "Supply teams are preparing the local distribution route.",
      "Warehouse cargo is being loaded for dispatch.",
      "Initial buyers have confirmed local demand.",
      "Traffic conditions are affecting delivery speed.",
      "Fuel logistics are being adjusted across the route.",
      "Additional local buyers are reviewing the shipment.",
      "Warehouse coordination is stabilizing the operation.",
      "Final distribution checks are being completed.",
      "Contract settlement teams are preparing the final report.",
    ],

    REGIONAL_TRADE: [
      "Trade convoy has entered the regional commercial route.",
      "Transport teams are checking route conditions before expansion.",
      "Regional buyers are reviewing supply terms.",
      "Route inspections are influencing delivery speed.",
      "Commercial negotiations are active across regional markets.",
      "Weather and traffic conditions are affecting transport efficiency.",
      "A stronger buyer group is reviewing the trade offer.",
      "Regional warehouses are coordinating final movement.",
      "Trade partners are confirming delivery reports.",
      "Final regional trade settlement is being calculated.",
    ],

    IMPERIAL_EXPANSION: [
      "Imperial project office is preparing expansion documents.",
      "Strategic advisors are reviewing territory conditions.",
      "Industrial partners are entering early project discussions.",
      "Infrastructure teams are assessing expansion routes.",
      "Investor confidence is shifting as negotiations continue.",
      "Regional authorities are reviewing project clearance.",
      "A major industrial partner is evaluating the proposal.",
      "Expansion teams are adjusting logistics and capital allocation.",
      "Strategic contract terms are entering final review.",
      "Final expansion report is being prepared by the project office.",
    ],
  };

  const operationPool = pools[type];

  let selectedPool = ["Operation is progressing through its current phase."];

  if (Array.isArray(operationPool)) {
    selectedPool = operationPool;
  } else if (operationPool?.[stage]) {
    selectedPool = operationPool[stage];
  }

  const index = Math.min(
    selectedPool.length - 1,
    Math.floor(progress * selectedPool.length),
  );

  return selectedPool[index];
}
function getOperationCountdown(endsAtRaw) {
  const safeEndsAtRaw = String(endsAtRaw || "").endsWith("Z")
    ? endsAtRaw
    : `${endsAtRaw}Z`;

  const endsAt = new Date(safeEndsAtRaw).getTime();
  const now = Date.now();

  if (!Number.isFinite(endsAt)) return "--";

  const diffMs = endsAt - now;

  if (diffMs <= 0) return "Ready to collect";

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}
function getFulfillmentLabel(operationType) {
  const type = String(operationType || "").trim().toUpperCase();

  if (type === "LOCAL_SUPPLY") return "Local Factory Fulfillment";
  if (type === "REGIONAL_TRADE") return "Regional Factory Fulfillment";
  if (type === "IMPERIAL_EXPANSION") return "Grand Factory Fulfillment";

  return "Factory Fulfillment";
}

function getFulfillmentCooldownCountdown(endsAtRaw) {
  if (!endsAtRaw) return "--";

  const safeEndsAtRaw = String(endsAtRaw).endsWith("Z")
    ? endsAtRaw
    : `${endsAtRaw}Z`;

  const endsAt = new Date(safeEndsAtRaw).getTime();
  const now = Date.now();

  if (!Number.isFinite(endsAt)) return "--";

  const diffMs = endsAt - now;

  if (diffMs <= 0) return "Available now";

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}
function startEmpireOperationsCountdownTicker() {
  clearInterval(empireOperationsCountdownInterval);

  empireOperationsCountdownInterval = setInterval(() => {
    const countdownEl = document.getElementById("active-operation-countdown");

    if (!countdownEl) return;

    const endsAt = countdownEl.dataset.endsAt;

    countdownEl.textContent = `Time Remaining: ${getOperationCountdown(endsAt)}`;
  }, 1000);
}
function startFactoryFulfillmentCooldownTicker() {
  clearInterval(window.factoryFulfillmentCooldownInterval);

  window.factoryFulfillmentCooldownInterval = setInterval(() => {
    const box = document.getElementById("factory-fulfillment-cooldown-box");
    const timer = document.getElementById("factory-fulfillment-cooldown-timer");

    if (!box || !timer) return;

    const endsAt = box.dataset.cooldownEndsAt;
    if (!endsAt) return;

    const countdown = getFulfillmentCooldownCountdown(endsAt);

    if (countdown === "Available now") {
      timer.textContent = "Available now. Refreshing...";
      clearInterval(window.factoryFulfillmentCooldownInterval);

      setTimeout(() => {
        loadEmpireOperations();
      }, 1200);

      return;
    }

    timer.textContent = `Available again in: ${countdown}`;
  }, 1000);
}
function renderEmpireOperations(area, operations, playerData) {
  const activeOperation = playerData.activeOperation;
  const industrialAuthority = Number(playerData.industrialAuthority || 0);
  const fulfillmentCooldown = playerData.fulfillmentCooldown || {
  active: false,
  cooldownEndsAt: null,
  lastCompletedType: null,
};

  const iaRewards = [
    { ia: 50, reward: "50 EMP" },
    { ia: 100, reward: "120 EMP" },
    { ia: 200, reward: "L1 Frontier" },
    { ia: 400, reward: "L2 Estate" },
    { ia: 800, reward: "L3 Industrial Zone" },
  ];

  let html = `
  
  <div
    style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:16px;
      flex-wrap:wrap;
      margin:14px 0 18px;
      padding:14px 18px;
      border-radius:18px;
      background:linear-gradient(135deg,#eff6ff 0%,#f8fafc 55%,#fff7ed 100%);
      border:1px solid #dbeafe;
      box-shadow:0 10px 24px rgba(15,23,42,0.06);
    "
  >
    <div style="font-weight:900; color:#0f172a;">
      ⚡ ${Number(playerData.currentEP || 0).toFixed(2)} EP/day
    </div>

    <div style="font-weight:800; color:#334155;">
      EMP: ${Number(playerData.empBalance || 0).toLocaleString()}
    </div>
<div style="font-weight:900; color:#0f172a;">
  🏭 IA: ${Number(playerData.industrialAuthority || 0).toFixed(1)} / 800
</div>
    <div style="color:#dc2626; font-weight:800;">
  📜 Hold 1 Founder WRIT and reach Industrial Authority rewards 5% faster.
</div>
  </div>
  ${fulfillmentCooldown.active ? `
  <div
    id="factory-fulfillment-cooldown-box"
    data-cooldown-ends-at="${fulfillmentCooldown.cooldownEndsAt || ""}"
    style="
      margin:14px 0 18px;
      padding:16px 18px;
      border-radius:18px;
      background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);
      border:1px solid #fdba74;
      color:#9a3412;
      font-weight:900;
      box-shadow:0 10px 24px rgba(251,146,60,0.12);
    "
  >
    ⏳ Factory Fulfillment cooldown active<br>
    <span style="font-weight:800;">
      Last completed: ${getFulfillmentLabel(fulfillmentCooldown.lastCompletedType)}
    </span><br>
    <span id="factory-fulfillment-cooldown-timer">
      Available again in: ${getFulfillmentCooldownCountdown(fulfillmentCooldown.cooldownEndsAt)}
    </span>
  </div>
` : `
  <div
    id="factory-fulfillment-cooldown-box"
    style="
      margin:14px 0 18px;
      padding:14px 18px;
      border-radius:18px;
      background:linear-gradient(135deg,#ecfdf5 0%,#dcfce7 100%);
      border:1px solid #86efac;
      color:#166534;
      font-weight:900;
      box-shadow:0 10px 24px rgba(34,197,94,0.10);
    "
  >
    ✅ Factory Fulfillment available now
  </div>
`}
  <div style="margin:10px 18px 18px;">
  <div
    style="
      height:18px;
      background:#e2e8f0;
      border-radius:999px;
      overflow:hidden;
      border:1px solid #cbd5e1;
    "
  >
    <div
      style="
        height:100%;
        width:${industrialAuthority > 0 ? Math.max(Math.min((industrialAuthority / 800) * 100, 100), 1) : 0}%;
        background:linear-gradient(90deg,#f59e0b,#facc15);
        box-shadow:0 0 18px rgba(251,191,36,0.75);
        border-radius:999px;
      "
    ></div>
  </div>
</div>
    

  <div
    style="
      margin-top:6px;
      display:flex;
gap:10px;
flex-wrap:wrap;
margin-top:10px;
    "
  >
    <div
  style="
    display:flex;
flex-wrap:wrap;
justify-content:flex-start;
gap:12px;
    margin-top:14px;
    font-size:11px;
    font-weight:900;
    color:#b45309;
  "
>
  <span style="padding:4px 0;">50 IA → +50 EMP
<br>
<button
  onclick="claimIAReward(50)"
style="display:${industrialAuthority >= 50 ? "inline-block" : "none"}";
  style="
    margin-top:4px;
    padding:4px 10px;
    border:none;
    border-radius:999px;
    background:#f59e0b;
    color:white;
    font-size:11px;
    font-weight:800;
    cursor:pointer;
  "
>
  Claim
</button></span>
<span style="padding:4px 0;">
  100 IA → +120 EMP
  <br>
  <button
    onclick="claimIAReward(100)"
    style="display:${industrialAuthority >= 100 ? "inline-block" : "none"};
      margin-top:4px;
      padding:4px 10px;
      border:none;
      border-radius:999px;
      background:#f59e0b;
      color:white;
      font-size:11px;
      font-weight:800;
      cursor:pointer;
    "
  >
    Claim
  </button>
</span>
<span style="padding:4px 0;">200 IA → L1 Frontier</span>
<span style="padding:4px 0;">400 IA → L2 Estate</span>
<span style="padding:4px 0;">800 IA → L3 Industrial Zone</span>
</div>
  </div>

  <div style="margin-top:6px; font-size:12px; color:#64748b; font-weight:700;">
    Claiming any IA reward resets IA back to 0.
    
    <div style="margin-top:4px; font-size:12px; color:#64748b; font-weight:700;">
  IA (Industrial Authority) is earned by completing Empire Operations.
</div>

<div style="margin-top:4px; font-size:12px; color:#64748b;">
  Local Supply gives +1 IA, Regional Trade +2 IA, and Imperial Expansion +3 IA.
</div>

<div style="margin-top:4px; font-size:12px; color:#64748b;">
  Additional IA bonus based on EP/day:
  100+ EP/day = +0.5 IA,
  250+ EP/day = +1 IA,
  500+ EP/day = +1.5 IA.
</div>

<div style="margin-top:4px; margin-bottom:18px; font-size:12px; color:#64748b;">
  Only the first 3 completed Local Supply operations per day count toward IA progression.
</div>
  </div>
</div>
`;

  if (activeOperation) {
    console.log("ACTIVE OPERATION TIME CHECK:", {
      started_at: activeOperation.started_at,
      ends_at: activeOperation.ends_at,
      countdown: getOperationCountdown(activeOperation.ends_at),
    });

    html += `
    <div
      class="summary-card operation-active-card"
      style="
        margin-bottom:22px;
        border:2px solid #f59e0b;
        padding:28px;
        max-width:1180px;
margin-left:auto;
margin-right:auto;
      "
    >
      <div
        style="
          display:grid;
          grid-template-columns: 1fr 320px;
          gap:24px;
          align-items:center;
        "
      >
        <div>
          <div class="summary-label">🏭 Active Operation</div>

          <div class="summary-value">
            ${activeOperation.operation_type.replaceAll("_", " ")}
          </div>

          <div class="summary-sub">
            Budget: ${activeOperation.emp_committed} EMP
          </div>

          <div
            class="summary-sub"
            style="
              margin-top:14px;
              padding:12px 14px;
              background:#fff7ed;
              border:1px solid #fdba74;
              border-radius:14px;
              color:#9a3412;
              font-weight:700;
              line-height:1.5;
            "
          >
            📡 ${getEmpireOperationStatusText(activeOperation)}
          </div>

          <div
            class="summary-sub"
            style="
              margin-top:14px;
              
              color:#64748b;
              font-style:italic;
            "
          >
            📡 Monitor your operation regularly for live operation updates.
          </div>
        </div>

        <div
          style="
            background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%);
            border:1px solid #bfdbfe;
            border-radius:20px;
            padding:20px;
            text-align:center;
            box-shadow:0 12px 28px rgba(37,99,235,0.14);
          "
        >
          <div
            id="active-operation-countdown"
            data-ends-at="${activeOperation.ends_at}"
            style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:10px 14px;
              border-radius:999px;
              background:#ffffff;
              border:1px solid #bfdbfe;
              color:#1d4ed8;
              font-weight:900;
              margin-bottom:16px;
            "
          >
            Time Remaining: ${getOperationCountdown(activeOperation.ends_at)}
          </div>

          <button
            class="primary-button"
            style="
              width:100%;
              padding:13px 18px;
              border-radius:16px;
              font-weight:900;
            "
            onclick="collectEmpireOperation(${activeOperation.id})"
          >
            Collect Operation Report
          </button>
        </div>
      </div>
    </div>
  `;
  }
  html += `
<div class="empire-ops-intel-card">

  <div class="empire-ops-intel-top">
    <div class="empire-ops-intel-icon">◆</div>
    <div>
      <div class="empire-ops-intel-kicker">OPERATIONS INTELLIGENCE</div>
      <div class="empire-ops-intel-title">Big contracts can open bigger doors</div>
    </div>
  </div>

  <div class="empire-ops-intel-body">
    Every operation is a business move. Most contracts return standard EMP revenue,
    but strong operations may uncover valuable expansion opportunities.
  </div>

  <div class="empire-ops-intel-grid">
    <div class="empire-ops-intel-chip green">
      Supply access
    </div>
    <div class="empire-ops-intel-chip yellow">
      Trade expansion
    </div>
    <div class="empire-ops-intel-chip orange">
      Rare territory growth
    </div>
  </div>

  <div class="empire-ops-intel-note">
    The bigger the contract, the greater the chance your empire discovers something beyond normal revenue.
  </div>

</div>
`;
  html += `<div class="summary-grid">`;

  Object.entries(operations).forEach(([key, operation]) => {
    const unlocked = Number(playerData.currentEP || 0) >= operation.requiredEP;

    const operationCardBackground =
      key === "LOCAL_SUPPLY"
        ? "linear-gradient(180deg,#f0fdf4 0%,#ffffff 100%)"
        : key === "REGIONAL_TRADE"
          ? "linear-gradient(180deg,#fefce8 0%,#ffffff 100%)"
          : "linear-gradient(180deg,#fff7ed 0%,#ffffff 100%)";

    html += `
  <div
    class="summary-card"
    style="
      background:${operationCardBackground} !important;
    "
  >

        <div class="summary-label">
          ⚙️ ${operation.label}
        </div>

        <div class="summary-sub">
          Required EP/day: ${operation.requiredEP}
        </div>

        <div class="summary-sub">
          Duration: ${operation.durationHours} Hours
        </div>

        <div class="summary-sub">
          Risk Profile:
<span style="
  color:
    ${
      operation.risk === "LOW"
        ? "#16a34a"
        : operation.risk === "MODERATE"
          ? "#ca8a04"
          : "#ea580c"
    };
  font-weight:800;
">
  ${operation.risk}
</span>
        </div>

        <div class="summary-sub" style="margin-top:10px;">
          Select Budget
        </div>

        <select id="operation-budget-${key}" class="primary-select">
          ${operation.budgets
            .map((b) => `<option value="${b}">${b} EMP</option>`)
            .join("")}
        </select>

        <button
          class="primary-button"
          style="margin-top:12px; width:100%;"
          onclick="startEmpireOperation('${key}')"
          ${!unlocked || activeOperation ? "disabled" : ""}
        >
          ${
            activeOperation
              ? "Operation Running"
              : !unlocked
                ? `Requires ${operation.requiredEP} EP/day`
                : "Start Operation"
          }
        </button>

      </div>
    `;
  });

  html += `</div>`;

  const history = Array.isArray(playerData.history) ? playerData.history : [];
  const completedHistory = history.filter((op) => op.status === "COMPLETED");

  if (completedHistory.length > 0) {
    html += `
    <div class="summary-card" style="margin-top:18px;">
      <div class="summary-label">Recent Operation Reports</div>

      <div
        style="
          margin-top:12px;
          max-height:260px;
          overflow-y:auto;
          display:flex;
          flex-direction:column;
          gap:8px;
          padding-right:6px;
        "
      >
        ${completedHistory
          .map((op) => {
            const opType = String(op.operation_type || "").toUpperCase();

            const historyTheme = opType.includes("LOCAL")
              ? {
                  bg: "#ecfdf5",
                  border: "#86efac",
                  color: "#15803d",
                }
              : opType.includes("REGIONAL")
                ? {
                    bg: "#fffbeb",
                    border: "#fde68a",
                    color: "#ca8a04",
                  }
                : {
                    bg: "#fff7ed",
                    border: "#fdba74",
                    color: "#ea580c",
                  };

            return `
      <div
        style="
          display:grid;
          grid-template-columns: 1.3fr 1fr 1fr 1fr 1.2fr;
          gap:12px;
          align-items:center;
          padding:10px 12px;
          border:1px solid ${historyTheme.border};
          border-radius:12px;
          background:${historyTheme.bg};
          font-size:14px;
        "
      >
        <strong style="color:${historyTheme.color};">
          ${String(op.operation_type || "").replaceAll("_", " ")}
        </strong>
        <span>Result: ${op.result || "Completed"}</span>
        <span>Revenue: ${Number(op.reward_emp || 0)} EMP</span>
        <span>Budget: ${Number(op.emp_committed || 0)} EMP</span>
        <div>
  ${new Date(op.completed_at).toLocaleString()}
</div>
      </div>
    `;
          })
          .join("")}
      </div>
    </div>
  `;
  }

  area.innerHTML = html;
    startFactoryFulfillmentCooldownTicker();

  if (fulfillmentCooldown.active) {
    const startButtons = area.querySelectorAll("button");

    startButtons.forEach((btn) => {
      const text = String(btn.textContent || "").toLowerCase();

      if (
        text.includes("start") ||
        text.includes("fulfillment") ||
        text.includes("contract")
      ) {
        btn.disabled = true;
        btn.style.opacity = "0.55";
        btn.style.cursor = "not-allowed";
      }
    });
  }
  if (isEmpireOperationsVisitorMode()) {
    area.querySelectorAll("button").forEach((btn) => {
      btn.disabled = true;
      btn.style.opacity = "0.55";
      btn.style.cursor = "not-allowed";
    });

    area.insertAdjacentHTML(
      "afterbegin",
      `
    <div class="status-text" style="margin-bottom:12px;">
      Viewing another empire. Empire Operations are visible in read-only mode.
    </div>
    `,
    );
  }
  startEmpireOperationsCountdownTicker();
}
async function startEmpireOperation(operationType) {
  const params = new URLSearchParams(window.location.search);

  const username =
    params.get("user") || params.get("view") || getLoggedInUser();

  if (!username) {
    showEmpirePopup(
      "⚠️ Wallet Required",
      "Please connect wallet first.",
      "error",
    );
    return;
  }

  const budgetSelect = document.getElementById(
    `operation-budget-${operationType}`,
  );

  const budget = Number(budgetSelect?.value || 0);

  if (!budget) {
    showEmpirePopup(
      "⚠️ Budget Required",
      "Please select operational budget.",
      "error",
    );
    return;
  }

  const confirmed = confirm(
    `Start this operation with ${budget} EMP operational budget?`,
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE}/empire-operations/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mde-actor": username,
      },
      body: JSON.stringify({
        username,
        operation_type: operationType,
        budget,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showEmpirePopup(
        "⚠️ Operation Failed",
        data.error || "Failed to start operation.",
        "error",
      );
      return;
    }

    showEmpirePopup(
      "✅ Operation Started",
      "Your industrial operation is now underway.",
      "success",
    );

    loadDashboardSummary().catch((refreshErr) => {
      console.warn(
        "Dashboard refresh failed after operation start:",
        refreshErr,
      );
    });

    loadEmpireOperations().catch((refreshErr) => {
      console.warn(
        "Operations refresh failed after operation start:",
        refreshErr,
      );
    });
  } catch (err) {
    console.error("Start Empire Operation request failed:", err);

    console.error("Empire operation refresh error:", err);
  }
}
async function claimIAReward(requiredIA) {
  const username = getLoggedInUser();

  if (!username) {
    showEmpirePopup(
      "⚠️ Wallet Required",
      "Please connect wallet first.",
      "error"
    );
    return;
  }

  const confirmed = confirm(
    `Claim this IA reward?\n\nThis will reset your Industrial Authority to 0.`
  );

  if (!confirmed) return;

  try {
    const response = await fetch(
      `${API_BASE}/empire-operations/claim-ia-reward`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mde-actor": username,
        },
        body: JSON.stringify({
          username,
          required_ia: requiredIA,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to claim IA reward.");
    }

    const rewardLabel = data.reward?.label || "Reward";

    showEmpirePopup(
      "🏆 IA Reward Claimed",
      `${rewardLabel} claimed successfully. IA reset to 0.`,
      "success"
    );

    if (typeof loadDashboardSummary === "function") {
      await loadDashboardSummary();
    }

    if (typeof loadEmpireOperations === "function") {
      await loadEmpireOperations();
    }

  } catch (err) {
    showEmpirePopup("❌ Claim Failed", err.message, "error");
  }
}
async function collectEmpireOperation(operationId) {
  const username = getLoggedInUser();

  if (!username) {
    showEmpirePopup(
      "⚠️ Wallet Required",
      "Please connect wallet first.",
      "error",
    );
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/empire-operations/collect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mde-actor": username,
      },
      body: JSON.stringify({
        username,
        operation_id: operationId,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showEmpirePopup(
        "⚠️ Collection Failed",
        data.error || "Failed to collect Empire Operation.",
        "error",
      );
      return;
    }

    const revenue = Number(
      data.outcome?.revenue || data.operation?.reward_emp || 0,
    );
    const result =
      data.outcome?.result || data.operation?.result || "Operation Completed";

    showEmpirePopup(
      "💰 Revenue Collected",
      `
<div style="font-size:20px;font-weight:700;margin-bottom:10px;">
  ${result}
</div>

${
  data.outcome?.jackpotLand || data.outcome?.jackpotBlueprint
    ? ""
    : `
<div style="font-size:18px;line-height:1.7;">
  <strong>${revenue} EMP</strong> has been added to your empire balance.
</div>
`
}

${
  data.outcome?.jackpotLand
    ? `
<div style="margin-top:12px; font-size:18px; font-weight:800; color:#f59e0b;">
  ${
    data.outcome?.jackpotLand
      ? `
<div style="margin-top:12px; font-size:18px; font-weight:800; color:#f59e0b;">
  🎁 Bonus Reward: ${data.outcome.jackpotLand} Land acquired
</div>
`
      : data.outcome?.jackpotBlueprint === true ||
          data.outcome?.result === "Industrial Discovery B1 Blueprint"
        ? `
<div style="margin-top:12px; font-size:18px; font-weight:800; color:#8b5cf6;">
  🎁 Bonus Reward: ${data.outcome.jackpotBlueprintTier || "Random B1 Blueprint"} acquired
</div>
`
        : ""
  }
</div>
`
    : ""
}
`,
      "success",
    );

    loadDashboardSummary().catch((refreshErr) => {
      console.warn(
        "Dashboard refresh failed after operation collect:",
        refreshErr,
      );
    });

    loadEmpireOperations().catch((refreshErr) => {
      console.warn(
        "Operations refresh failed after operation collect:",
        refreshErr,
      );
    });
  } catch (err) {
    console.error("Collect Empire Operation request failed:", err);

    console.error("Empire operation collection refresh error:", err);
  }
}
