// js/goods.js
// Temporary file name only.
// Internal code uses final-compatible Goods names.

const GOODS_LOCAL_API = "http://localhost:10000";
const GOODS_PROD_API = "https://mydempire-backend-1.onrender.com";

const GOODS_API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? GOODS_LOCAL_API
    : GOODS_PROD_API;
function getGoodsImagePath(productKey) {
  const key = String(productKey || "").trim();

  if (!key) {
    return "";
  }

  return `assets/goods/${key}.png`;
}
const GOODS_INDUSTRY_ORDER = {
  FOOD: 1,
  TEXTILE: 2,
  PHARMA: 3,
  CHEMICAL: 4,
  SUPERMARKET: 5,
};

const GOODS_LEVEL_ORDER = {
  ESSENTIAL: 1,
  STANDARD: 2,
  VALUE: 3,
  PREMIUM: 4,
  LUXURY: 5,
};

const GOODS_QUALITY_ORDER = {
  STANDARD: 1,
  FINE: 2,
  SUPERIOR: 3,
};
let latestGoodsPreview = null;
let goodsClaimInProgress = false;

function getGoodsLoggedInUser() {
  return (
    localStorage.getItem("hiveUsername") ||
    localStorage.getItem("mde_username") ||
    localStorage.getItem("username") ||
    ""
  )
    .replace("@", "")
    .trim()
    .toLowerCase();
}

function setGoodsText(id, value) {
  const el = document.getElementById(id);

  if (el) {
    el.textContent = value;
  }
}

function escapeGoodsHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatGoodsDate(value) {
  if (!value) return "--";

  const date = new Date(value);

  if (isNaN(date.getTime())) return "--";

  return date.toLocaleString();
}

function setGoodsClaimButtonState(enabled, text = "Claim All Goods") {
  const btn = document.getElementById("goods-claim-btn");

  if (!btn) return;

  btn.disabled = !enabled;
  btn.textContent = text;
}

function renderGoodsFactoryList(containerId, factories, emptyText) {
  const box = document.getElementById(containerId);

  if (!box) return;

  if (!Array.isArray(factories) || factories.length === 0) {
    box.innerHTML = `<div class="goods-empty-card">${escapeGoodsHtml(emptyText)}</div>`;
    return;
  }

  box.innerHTML = factories
    .map((factory) => {
      const readyText = factory.ready ? "Ready" : "Cooldown";
      const readyClass = factory.ready ? "goods-ready" : "goods-cooldown";

      const statusHtml =
        factory.ready !== undefined
          ? `<span class="${readyClass}">${readyText}</span>`
          : `<span class="goods-skipped">Skipped</span>`;

      return `
        <div class="goods-factory-card">
          <div class="goods-factory-top">
            <strong>${escapeGoodsHtml(factory.tier || "--")}</strong>
            <span>${escapeGoodsHtml(factory.industry || "UNKNOWN")}</span>
          </div>

          <div class="goods-factory-bottom">
            <span>Factory #${escapeGoodsHtml(factory.id || "--")}</span>
            ${statusHtml}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderGoodsInventory(items, summary) {
  const box = document.getElementById("goods-inventory-list");

  if (!box) return;

  if (!Array.isArray(items) || items.length === 0) {
    box.innerHTML = `
      <div class="goods-empty-card">
        No Goods in inventory yet. Claim from ready factories to collect products.
      </div>
    `;
    return;
  }

  const groupedGoods = new Map();

  items.forEach((item) => {
    const status = String(item.status || "AVAILABLE").toUpperCase();

    if (status !== "AVAILABLE") return;

    const groupKey = [
      item.industry || "UNKNOWN",
      item.product_name || "Unknown Product",
      item.product_level || "--",
      item.quality || "STANDARD",
      Number(item.final_value || 0),
    ].join("|");

    if (!groupedGoods.has(groupKey)) {
      groupedGoods.set(groupKey, {
        industry: item.industry || "UNKNOWN",
        product_key: item.product_key || "",
        product_name: item.product_name || "Unknown Product",
        product_level: item.product_level || "--",
        quality: item.quality || "STANDARD",
        final_value: Number(item.final_value || 0),
        goods_ids: [],
        quantity: 0,
      });
    }

    const group = groupedGoods.get(groupKey);

    if (item.id) {
      group.goods_ids.push(Number(item.id));
    }

    group.quantity += 1;
  });

  const groups = Array.from(groupedGoods.values()).sort((a, b) => {
    const industryA =
      GOODS_INDUSTRY_ORDER[String(a.industry || "").toUpperCase()] || 999;
    const industryB =
      GOODS_INDUSTRY_ORDER[String(b.industry || "").toUpperCase()] || 999;

    if (industryA !== industryB) return industryA - industryB;

    const levelA =
      GOODS_LEVEL_ORDER[String(a.product_level || "").toUpperCase()] || 999;
    const levelB =
      GOODS_LEVEL_ORDER[String(b.product_level || "").toUpperCase()] || 999;

    if (levelA !== levelB) return levelA - levelB;

    const qualityA =
      GOODS_QUALITY_ORDER[String(a.quality || "").toUpperCase()] || 999;
    const qualityB =
      GOODS_QUALITY_ORDER[String(b.quality || "").toUpperCase()] || 999;

    if (qualityA !== qualityB) return qualityA - qualityB;

    return String(a.product_name || "").localeCompare(
      String(b.product_name || ""),
    );
  });

  if (groups.length === 0) {
    box.innerHTML = `
      <div class="goods-empty-card">
        No available Goods in inventory. Submitted Goods are already in redemption.
      </div>
    `;
    return;
  }

  box.innerHTML = groups
    .map((group, index) => {
      const qualitySlug = String(group.quality || "STANDARD").toLowerCase();
      const levelSlug = String(group.product_level || "").toLowerCase();

      const qualityClass = `goods-quality-${qualitySlug}`;
      const levelClass = `goods-level-${levelSlug}`;

      const qualityUpper = String(group.quality || "STANDARD").toUpperCase();

      const qualityDots =
        qualityUpper === "SUPERIOR"
          ? "◆◆◆"
          : qualityUpper === "FINE"
            ? "◆◆"
            : "◆";
      const levelUpper = String(
        group.product_level || "ESSENTIAL",
      ).toUpperCase();

      const rarityMark =
        levelUpper === "LUXURY"
          ? "R5"
          : levelUpper === "PREMIUM"
            ? "R4"
            : levelUpper === "VALUE"
              ? "R3"
              : levelUpper === "STANDARD"
                ? "R2"
                : "R1";
      const goodsIdsText = group.goods_ids.join(",");

      return `
        <div class="goods-product-card goods-collectible-card ${qualityClass} ${levelClass}">
          <div class="goods-collectible-frame">
            <div class="goods-card-topline">
              <span class="goods-card-name">${escapeGoodsHtml(group.product_name)}</span>
              <span class="goods-card-qty">x${group.quantity}</span>
<span class="goods-card-rarity">${rarityMark}</span>
            </div>

            <div class="goods-card-industry">
              ${escapeGoodsHtml(group.industry)}
            </div>

            <div
              class="goods-card-quality goods-quality-dots-${qualitySlug}"
              title="${escapeGoodsHtml(group.quality)} Quality"
            >
              ${qualityDots}
            </div>

           <div class="goods-card-image-area">
  <img
    src="${getGoodsImagePath(group.product_key)}"
    alt="${escapeGoodsHtml(group.product_name)}"
    loading="lazy"
    onerror="this.style.display='none'; this.parentElement.classList.add('goods-image-missing');"
  />
</div>

            <div class="goods-card-pv">
              ${group.final_value} PV
            </div>
          </div>

          <div class="goods-card-control-row">
            <label class="goods-submit-check">
              <input
                type="checkbox"
                class="goods-submit-checkbox"
                value="${escapeGoodsHtml(goodsIdsText)}"
                data-good-value="${group.final_value}"
                data-good-count="${group.quantity}"
                data-qty-input-id="goods-submit-qty-${index}"
              />
              <span>Select</span>
            </label>

            <div class="goods-submit-qty-box">
              <span>Qty</span>
              <input
                id="goods-submit-qty-${index}"
                class="goods-submit-qty-input"
                type="number"
                min="1"
                max="${group.quantity}"
                value="1"
              />
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const totalGoods = Number(summary?.totalGoods || 0);
  const totalValue = Number(summary?.totalValue || 0);

  setGoodsText(
    "goods-status",
    `Inventory: ${totalGoods} available Goods • Total Product Value: ${totalValue}`,
  );
}
function updateGoodsSelectedSummary() {
  const selectedBoxes = Array.from(
    document.querySelectorAll(".goods-submit-checkbox:checked"),
  );

  let selectedGoodsCount = 0;
  let selectedPV = 0;

  selectedBoxes.forEach((box) => {
    const qtyInputId = box.dataset.qtyInputId;
    const qtyInput = qtyInputId ? document.getElementById(qtyInputId) : null;

    const maxQty = Number(box.dataset.goodCount || 0);
    const eachPV = Number(box.dataset.goodValue || 0);

    let qty = qtyInput ? Number(qtyInput.value || 0) : maxQty;

    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    if (maxQty > 0 && qty > maxQty) qty = maxQty;

    if (qtyInput) {
      qtyInput.value = qty;
    }

    selectedGoodsCount += qty;
    selectedPV += qty * eachPV;
  });

  setGoodsText("goods-selected-count", String(selectedGoodsCount));
  setGoodsText("goods-selected-pv", `${selectedPV} PV`);

  const submitBtn = document.getElementById("goods-submit-selected-btn");

  if (submitBtn) {
    submitBtn.disabled = selectedGoodsCount <= 0;
  }
}
function setupGoodsInventorySelection() {
  const inventoryBox = document.getElementById("goods-inventory-list");

  if (!inventoryBox) return;

  inventoryBox.addEventListener("change", (event) => {
    const target = event.target;

    if (
      target.classList.contains("goods-submit-checkbox") ||
      target.classList.contains("goods-submit-qty-input")
    ) {
      updateGoodsSelectedSummary();
    }
  });

  inventoryBox.addEventListener("input", (event) => {
    const target = event.target;

    if (target.classList.contains("goods-submit-qty-input")) {
      updateGoodsSelectedSummary();
    }
  });
}
function renderGoodsLockedState(data) {
  const ep = Number(data?.epPerDay || 0);

  if (ep >= 100) {
    return false;
  }

  setGoodsClaimButtonState(false);
  setGoodsText(
    "goods-status",
    "Goods locked. Reach 100 EP/day to unlock Goods production.",
  );

  renderGoodsFactoryList(
    "goods-selected-list",
    [],
    "Goods locked. No factories can produce yet.",
  );

  renderGoodsFactoryList(
    "goods-skipped-list",
    data?.selectedFactories || [],
    "No active factories found.",
  );

  return true;
}

function renderGoodsPreview(data) {
  latestGoodsPreview = data;

  const epPerDay = Number(data.epPerDay || 0);
  const capacityPercent = Number(data.capacityPercent || 0);
  const readyFactoryCount = Number(data.readyFactoryCount || 0);
  const eligibleFactoryCount = Number(data.eligibleFactoryCount || 0);

  setGoodsText("goods-ep-day", epPerDay.toFixed(2));

  setGoodsText(
    "goods-capacity",
    `${data.capacityLabel || "Unknown"} (${Math.round(capacityPercent * 100)}%)`,
  );

  setGoodsText(
    "goods-ready-count",
    `${readyFactoryCount} / ${eligibleFactoryCount}`,
  );

  if (renderGoodsLockedState(data)) {
    return;
  }

  setGoodsText(
    "goods-status",
    `Active factories: ${data.activeFactoryCount || 0} • Producing: ${
      data.eligibleFactoryCount || 0
    } • Skipped: ${(data.skippedFactories || []).length}`,
  );
  setGoodsText(
    "goods-preview-note",
    `Inventory: ${Number(data.inventoryCount ?? data.availableGoodsCount ?? data.available_goods_count ?? 0)} available Goods • Total Product Value: ${Number(data.totalProductValue ?? data.total_product_value ?? data.inventoryProductValue ?? data.inventory_product_value ?? 0)}
Factory Goods are generated from your active factories once per claim cycle.`,
  );

  renderGoodsFactoryList(
    "goods-selected-list",
    data.selectedFactories,
    "No factories selected for Goods production yet.",
  );

  renderGoodsFactoryList(
    "goods-skipped-list",
    data.skippedFactories,
    "No skipped factories. Full Goods production capacity active.",
  );
  startGoodsNextClaimTimer(
    data.remainingGoodsClaimSeconds ?? data.remaining_goods_claim_seconds ?? 0,
    Boolean(data.playerClaimReady),
  );
  setGoodsClaimButtonState(
    readyFactoryCount > 0,
    readyFactoryCount > 0 ? "Claim All Goods" : "Claim Cooldown",
  );
}
let goodsRedemptionCountdownTimer = null;
let goodsNextClaimTimer = null;

function formatGoodsClaimCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "Ready to claim now";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}

function startGoodsNextClaimTimer(remainingSeconds, isReady) {
  const btn = document.getElementById("goods-claim-btn");
  if (!btn) return;

  clearInterval(goodsNextClaimTimer);

  if (isReady) {
    btn.disabled = false;
    btn.textContent = "Claim All Goods";
    return;
  }

  let secondsLeft = Number(remainingSeconds || 0);

  if (!Number.isFinite(secondsLeft) || secondsLeft <= 0) {
    btn.disabled = true;
    btn.textContent = "Claim Cooldown";
    return;
  }

  function tick() {
    if (secondsLeft <= 0) {
      btn.disabled = false;
      btn.textContent = "Claim All Goods";
      clearInterval(goodsNextClaimTimer);
      return;
    }

    btn.disabled = true;
    btn.textContent = `Claim in ${formatGoodsClaimCountdown(secondsLeft * 1000)}`;
    secondsLeft -= 1;
  }

  tick();
  goodsNextClaimTimer = setInterval(tick, 1000);
}

function parseGoodsCycleTime(raw) {
  if (!raw) return NaN;

  const text = String(raw).trim();

  if (text.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(text)) {
    return new Date(text).getTime();
  }

  return new Date(`${text.replace(" ", "T")}Z`).getTime();
}

function formatGoodsCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "Cycle ended";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }

  return `${hours}h ${minutes}m ${seconds}s`;
}

function startGoodsRedemptionCountdown(endsAtRaw) {
  const countdownEl = document.getElementById("goods-redemption-countdown");
  if (!countdownEl) return;

  clearInterval(goodsRedemptionCountdownTimer);

  const endsAt = parseGoodsCycleTime(endsAtRaw);

  function tick() {
    const diff = endsAt - Date.now();
    countdownEl.textContent = formatGoodsCountdown(diff);
  }

  tick();
  goodsRedemptionCountdownTimer = setInterval(tick, 1000);
}
async function loadGoodsRedemptionPosition(username) {
  try {
    const response = await fetch(
      `${GOODS_API_BASE}/goods-redemption/${username}/position`,
    );

    const data = await response.json();
    const activeCycle =
      data.cycle ||
      data.activeCycle ||
      data.active_cycle ||
      data.redemption_cycle ||
      null;

    if (activeCycle) {
      startGoodsRedemptionCountdown(activeCycle.ends_at || activeCycle.endsAt);
    }

    if (!data.success || !data.hasActiveCycle) {
      clearInterval(goodsRedemptionCountdownTimer);

      const countdownEl = document.getElementById("goods-redemption-countdown");
      if (countdownEl) {
        countdownEl.textContent = "No Active Cycle";
      }

      setGoodsText("goods-redemption-status", "No active cycle");
      setGoodsText("goods-redemption-pool", "--");
      setGoodsText("goods-redemption-total-pv", "--");
      setGoodsText("goods-redemption-live-rate", "--");
      setGoodsText("goods-redemption-player-pv", "--");
      setGoodsText("goods-redemption-share", "--");
      setGoodsText("goods-redemption-estimated-emp", "--");
      setGoodsText(
        "goods-redemption-note",
        "No Goods redemption cycle is active right now.",
      );
      return;
    }

    const cycle = data.cycle || {};
    const player = data.player || {};

    const empPool = Number(cycle.emp_pool || 0);
    const totalPV = Number(cycle.total_product_value || 0);
    const liveRate = Number(cycle.live_emp_per_product_value || 0);

    const playerPV = Number(player.product_value_in_cycle || 0);
    const sharePercent = Number(player.share_percent || 0);
    const estimatedEmp = Number(player.estimated_emp_now || 0);

    setGoodsText("goods-redemption-status", "OPEN");
    setGoodsText("goods-redemption-pool", `${empPool.toFixed(2)} EMP`);
    setGoodsText("goods-redemption-total-pv", `${totalPV.toFixed(0)} PV`);
    setGoodsText(
      "goods-redemption-live-rate",
      `${liveRate.toFixed(4)} EMP / PV`,
    );
    setGoodsText("goods-redemption-player-pv", `${playerPV.toFixed(0)} PV`);
    setGoodsText("goods-redemption-share", `${sharePercent.toFixed(2)}%`);
    setGoodsText(
      "goods-redemption-estimated-emp",
      `${estimatedEmp.toFixed(2)} EMP`,
    );

    setGoodsText(
      "goods-redemption-note",
      "Final EMP may change until the cycle ends as more players burn Goods.",
    );
  } catch (err) {
    console.error("Failed to load Goods redemption position:", err);
    setGoodsText("goods-redemption-status", "Error");
    setGoodsText(
      "goods-redemption-note",
      "Could not load Goods redemption cycle right now.",
    );
  }
}
async function loadGoodsRedemptionLeaderboard() {
  try {
    const response = await fetch(
      `${GOODS_API_BASE}/goods-redemption/leaderboard`,
    );

    const data = await response.json();

    const list = document.getElementById("goods-redemption-leaderboard-list");

    if (!list) return;

    if (!data.success || !data.hasActiveCycle) {
      list.innerHTML = `
  <div
    class="goods-leaderboard-empty-wide"
    style="
      display:block !important;
      width:100% !important;
      max-width:100% !important;
      padding:16px 18px !important;
      border-radius:16px !important;
      background:#f8fafc !important;
      border:1px dashed #cbd5e1 !important;
      color:#475569 !important;
      font-size:16px !important;
      font-weight:800 !important;
      line-height:1.5 !important;
      white-space:nowrap !important;
      text-align:left !important;
      box-sizing:border-box !important;
    "
  >
    No active Goods redemption cycle right now.
  </div>
`;
      return;
    }

    const leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];

    if (leaderboard.length === 0) {
      list.innerHTML = `
        <div class="goods-empty-state">
          No Goods have been submitted into this cycle yet.
        </div>
      `;
      return;
    }

    const leaderboardHeader = `
  <div class="goods-redemption-leaderboard-header-row">
    <div>Rank</div>
    <div>Player</div>
    <div>Product Value</div>
    <div>Share</div>
    <div>Estimated EMP</div>
  </div>
`;

    const rowsHtml = leaderboard
      .map((row) => {
        const rank = Number(row.rank || 0);
        const username = String(row.username || "unknown");
        const goodsCount = Number(row.burned_goods_count || 0);
        const productValue = Number(row.product_value || 0);
        const sharePercent = Number(row.share_percent || 0);
        const estimatedEmp = Number(row.estimated_emp_now || 0);

        return `
      <div class="goods-redemption-leaderboard-row">
        <div class="goods-redemption-rank">#${rank}</div>

        <div class="goods-redemption-player">
          <strong>@${username}</strong>
          <span>${goodsCount} Goods submitted</span>
        </div>

        <div class="goods-redemption-leaderboard-stat">
          <strong>${productValue.toFixed(0)} PV</strong>
        </div>

        <div class="goods-redemption-leaderboard-stat">
          <strong>${sharePercent.toFixed(2)}%</strong>
        </div>

        <div class="goods-redemption-leaderboard-stat reward">
          <strong>${estimatedEmp.toFixed(2)} EMP</strong>
        </div>
      </div>
    `;
      })
      .join("");

    list.innerHTML = leaderboardHeader + rowsHtml;
  } catch (err) {
    console.error("Failed to load Goods redemption leaderboard:", err);

    const list = document.getElementById("goods-redemption-leaderboard-list");

    if (list) {
      list.innerHTML = `
    <div class="goods-leaderboard-empty-wide">
      Could not load leaderboard right now.
    </div>
  `;
    }
  }
}

async function loadGoodsRedemptionHistory(listElement) {
  const safeText = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[ch],
    );

  const formatNumber = (value, digits = 2) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0";
    return num.toFixed(digits);
  };

  const formatDate = (raw) => {
    if (!raw) return "--";
    const date = new Date(raw);
    if (isNaN(date.getTime())) return "--";
    return date.toLocaleString();
  };

  const list =
    listElement || document.getElementById("goods-redemption-history-list");

  if (!list) return;

  try {
    const response = await fetch(`${GOODS_API_BASE}/goods-redemption/history`);

    const data = await response.json();

    if (
      !data.success ||
      !Array.isArray(data.cycles) ||
      data.cycles.length === 0
    ) {
      list.innerHTML = `
        <div class="goods-empty-state">
          No active Goods redemption cycle right now.<br>
          No previous cycle history yet.
        </div>
      `;
      return;
    }

    const cycleCards = data.cycles
      .map((item) => {
        const cycle = item.cycle || {};
        const leaderboard = Array.isArray(item.leaderboard)
          ? item.leaderboard
          : [];

        const rows = leaderboard.length
          ? leaderboard
              .slice(0, 50)
              .map(
                (entry) => `
            <tr>
              <td>#${Number(entry.rank || 0)}</td>
              <td>@${safeText(entry.username)}</td>
              <td>${Number(entry.burned_goods_count || 0)}</td>
              <td>${formatNumber(entry.product_value, 2)}</td>
              <td>${formatNumber(entry.final_emp_reward, 2)} EMP</td>
            </tr>
          `,
              )
              .join("")
          : `
            <tr>
              <td colspan="5">No entries recorded for this cycle.</td>
            </tr>
          `;

        return `
        <div
          class="goods-history-cycle"
          style="
            margin:16px 0;
            padding:16px;
            border:1px solid #dbeafe;
            border-radius:16px;
            background:#ffffff;
          "
        >
          <div style="font-weight:900;font-size:18px;color:#111827;">
            🏭 ${safeText(cycle.cycle_name || `Cycle #${cycle.id}`)}
          </div>

          <div style="margin-top:6px;font-size:13px;color:#64748b;font-weight:700;">
            Status: ${safeText(cycle.status || "COMPLETED")} •
            Ended: ${formatDate(cycle.ends_at)}
          </div>

          <div style="margin-top:8px;font-size:13px;color:#334155;font-weight:800;">
            EMP Pool: ${formatNumber(cycle.emp_pool, 2)} EMP •
            Total Product Value: ${formatNumber(cycle.total_product_value, 2)} •
            Final Rate: ${formatNumber(cycle.final_emp_per_product_value, 4)} EMP / Product Value
          </div>

          <div style="overflow-x:auto;margin-top:12px;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#eff6ff;">
                  <th style="padding:8px;text-align:left;">Rank</th>
                  <th style="padding:8px;text-align:left;">Player</th>
                  <th style="padding:8px;text-align:left;">Goods Submitted</th>
                  <th style="padding:8px;text-align:left;">Product Value</th>
                  <th style="padding:8px;text-align:left;">EMP Reward</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      `;
      })
      .join("");

    list.innerHTML = `
      <div class="goods-history-wrap">
        <div
          style="
            padding:14px 16px;
            border-radius:16px;
            background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);
            border:1px solid #86efac;
            color:#14532d;
            font-weight:900;
            margin-bottom:14px;
          "
        >
          🏆 Previous Goods Redemption Cycles — Last 5
        </div>

        ${cycleCards}
      </div>
    `;
  } catch (err) {
    console.error("Failed to load Goods redemption history:", err);

    list.innerHTML = `
      <div class="goods-empty-state">
        Could not load Goods redemption history right now.
      </div>
    `;
  }
}
async function loadGoodsInventory() {
  const username = getGoodsLoggedInUser();

  if (!username) {
    renderGoodsInventory([], {
      totalGoods: 0,
      totalValue: 0,
    });
    return;
  }

  try {
    const response = await fetch(
      `${GOODS_API_BASE}/goods/${username}/inventory`,
    );
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to load Goods inventory.");
    }

    renderGoodsInventory(data.items || [], data.summary || {});
  } catch (err) {
    console.error("Goods inventory load error:", err);

    const box = document.getElementById("goods-inventory-list");

    if (box) {
      box.innerHTML = `
        <div class="goods-empty-card">
          ${escapeGoodsHtml(err.message || "Failed to load Goods inventory.")}
        </div>
      `;
    }
  }
}

async function loadGoodsPreview() {
  const username = getGoodsLoggedInUser();

  setGoodsText("goods-active-user", username || "--");

  if (!username) {
    setGoodsClaimButtonState(false);
    setGoodsText("goods-status", "Please connect wallet first.");
    await loadGoodsInventory();
    return;
  }

  setGoodsClaimButtonState(false, "Loading...");
  setGoodsText("goods-status", "Loading Goods preview...");

  try {
    const response = await fetch(`${GOODS_API_BASE}/goods/${username}/preview`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to load Goods preview.");
    }

    renderGoodsPreview(data);
    await loadGoodsInventory();
  } catch (err) {
    console.error("Goods preview load error:", err);

    setGoodsClaimButtonState(false);

    setGoodsText(
      "goods-status",
      err.message || "Failed to load Goods preview.",
    );

    await loadGoodsInventory();
  }
}

function buildGoodsClaimSummary(data) {
  const byLevel = data.byLevel || {};
  const byQuality = data.byQuality || {};

  const levelText = Object.keys(byLevel)
    .map((key) => `${key}: ${byLevel[key]}`)
    .join(", ");

  const qualityText = Object.keys(byQuality)
    .map((key) => `${key}: ${byQuality[key]}`)
    .join(", ");

  return [
    "Goods claimed successfully!",
    "",
    `Factories processed: ${data.factoriesProcessed || 0}`,
    `Goods received: ${data.goodsReceived || 0}`,
    `Total Product Value: ${data.totalValue || 0}`,
    "",
    `By Level: ${levelText || "None"}`,
    `By Quality: ${qualityText || "None"}`,
  ].join("\n");
}
function closeGoodsSubmitSuccessModal() {
  const modal = document.getElementById("goods-submit-success-modal");

  if (modal) {
    modal.classList.add("hidden");
  }
}

function showGoodsSubmitSuccessModal(data, selectedGoodsCount) {
  const modal = document.getElementById("goods-submit-success-modal");

  if (!modal) return;

  setGoodsText(
    "goods-submit-success-count",
    String(Number(selectedGoodsCount || data.burned_count || 0)),
  );

  setGoodsText(
    "goods-submit-success-pv",
    `${Number(data.burned_product_value || 0).toFixed(0)} PV`,
  );

  setGoodsText(
    "goods-submit-success-emp",
    `${Number(data.player?.estimated_emp_now || 0).toFixed(2)} EMP`,
  );

  modal.classList.remove("hidden");
}
function closeGoodsSubmitConfirmModal() {
  const modal = document.getElementById("goods-submit-confirm-modal");

  if (modal) {
    modal.classList.add("hidden");
  }
}

function openGoodsSubmitConfirmModal() {
  const selectedBoxes = Array.from(
    document.querySelectorAll(".goods-submit-checkbox:checked"),
  );

  let selectedGoodsCount = 0;
  let selectedPV = 0;

  selectedBoxes.forEach((box) => {
    const qtyInputId = box.dataset.qtyInputId;
    const qtyInput = qtyInputId ? document.getElementById(qtyInputId) : null;

    const maxQty = Number(box.dataset.goodCount || 0);
    const eachPV = Number(box.dataset.goodValue || 0);

    let qty = qtyInput ? Number(qtyInput.value || 0) : 1;

    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    if (maxQty > 0 && qty > maxQty) qty = maxQty;

    selectedGoodsCount += qty;
    selectedPV += qty * eachPV;
  });

  if (selectedGoodsCount <= 0) {
    alert("Please select at least one Good to submit.");
    return;
  }

  setGoodsText("goods-submit-confirm-count", String(selectedGoodsCount));
  setGoodsText("goods-submit-confirm-pv", `${selectedPV} PV`);

  const modal = document.getElementById("goods-submit-confirm-modal");

  if (modal) {
    modal.classList.remove("hidden");
  }
}

function closeGoodsClaimConfirmModal() {
  const modal = document.getElementById("goods-claim-confirm-modal");

  if (modal) {
    modal.classList.add("hidden");
  }
}
function closeGoodsClaimConfirmModal() {
  function openGoodsSubmitConfirmModal() {
    const selectedBoxes = Array.from(
      document.querySelectorAll(".goods-submit-checkbox:checked"),
    );

    let selectedGoodsCount = 0;
    let selectedPV = 0;

    selectedBoxes.forEach((box) => {
      const qtyInputId = box.dataset.qtyInputId;
      const qtyInput = qtyInputId ? document.getElementById(qtyInputId) : null;

      const maxQty = Number(box.dataset.goodCount || 0);
      const eachPV = Number(box.dataset.goodValue || 0);

      let qty = qtyInput ? Number(qtyInput.value || 0) : 1;

      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      if (maxQty > 0 && qty > maxQty) qty = maxQty;

      selectedGoodsCount += qty;
      selectedPV += qty * eachPV;
    });

    if (selectedGoodsCount <= 0) {
      alert("Please select at least one Good to submit.");
      return;
    }

    setGoodsText("goods-submit-confirm-count", String(selectedGoodsCount));
    setGoodsText("goods-submit-confirm-pv", `${selectedPV} PV`);

    const modal = document.getElementById("goods-submit-confirm-modal");

    if (modal) {
      modal.classList.remove("hidden");
    }
  }
  const modal = document.getElementById("goods-claim-confirm-modal");

  if (modal) {
    modal.classList.add("hidden");
  }
}

function openGoodsClaimConfirmModal() {
  const modal = document.getElementById("goods-claim-confirm-modal");

  if (modal) {
    modal.classList.remove("hidden");
  }
}
function closeGoodsClaimModal() {
  const modal = document.getElementById("goods-claim-modal");

  if (modal) {
    modal.classList.add("hidden");
  }
}

function showGoodsClaimModal(data) {
  const modal = document.getElementById("goods-claim-modal");
  const list = document.getElementById("goods-claim-modal-list");

  if (!modal || !list) return;

  const goods = Array.isArray(data.goods) ? data.goods : [];
  const processingCap = data.processing_cap || data.processingCap || {};
  const processingCapLabel = processingCap.label || "Processing Cap";
  const processingCapMaxGoods = Number(
    processingCap.max_goods ?? processingCap.maxGoods ?? 0,
  );
  const processingCapReached = Boolean(
    processingCap.cap_reached ?? processingCap.capReached ?? false,
  );
  const capReachedText = processingCapReached ? "Yes" : "No";
  const groupedGoods = new Map();

  goods.forEach((item) => {
    const groupKey = [
      item.product_key || "",
      item.product_name || "Unknown Product",
      item.quality || "STANDARD",
      item.product_level || "--",
      Number(item.final_value || 0),
    ].join("|");

    if (!groupedGoods.has(groupKey)) {
      groupedGoods.set(groupKey, {
        product_key: item.product_key || "",
        product_name: item.product_name || "Unknown Product",
        quality: item.quality || "STANDARD",
        product_level: item.product_level || "--",
        final_value: Number(item.final_value || 0),
        quantity: 0,
        total_value: 0,
      });
    }

    const group = groupedGoods.get(groupKey);
    group.quantity += 1;
    group.total_value += Number(item.final_value || 0);
  });

  setGoodsText(
    "goods-claim-modal-factories",
    String(Number(data.factories_processed ?? data.factoriesProcessed ?? 0)),
  );

  setGoodsText(
    "goods-claim-modal-count",
    String(
      Number(
        data.goods_received ??
          data.goodsReceived ??
          (Array.isArray(data.goods) ? data.goods.length : 0),
      ),
    ),
  );

  setGoodsText(
    "goods-claim-modal-pv",
    String(Number(data.total_product_value ?? data.totalProductValue ?? 0)),
  );

  setGoodsText(
    "goods-claim-modal-cap",
    `${processingCapLabel} · Max ${processingCapMaxGoods} Goods · Cap Reached: ${capReachedText}`,
  );
  const groups = Array.from(groupedGoods.values());

  if (groups.length === 0) {
    list.innerHTML = `
      <div class="goods-empty-card">
        No Goods received.
      </div>
    `;
  } else {
    list.innerHTML = groups
      .map((group) => {
        return `
          <div class="goods-claim-reward-card">
            <div class="goods-claim-reward-image">
              <img
                src="${getGoodsImagePath(group.product_key)}"
                alt="${escapeGoodsHtml(group.product_name)}"
                loading="lazy"
              />
            </div>

            <div class="goods-claim-reward-name">
              ${escapeGoodsHtml(group.product_name)}
            </div>

            <div class="goods-claim-reward-meta">
              x${group.quantity} • ${escapeGoodsHtml(group.quality)} • ${group.total_value} PV
            </div>
          </div>
        `;
      })
      .join("");
  }

  modal.classList.remove("hidden");
}
async function claimAllGoods() {
  const username = getGoodsLoggedInUser();
  const button = document.getElementById("goods-claim-btn");

  if (!username) {
    alert("Please login first.");
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Claiming...";
    }

    const response = await fetch(`${GOODS_API_BASE}/goods/${username}/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mde-actor": username,
      },
      body: JSON.stringify({ username }),
    });

    const data = await response.json();

    if (!data.success) {
      alert(data.error || "Failed to claim Goods.");
      return;
    }

    const factoriesProcessed = Number(
      data.factories_processed ?? data.factoriesProcessed ?? 0,
    );

    const goodsReceived = Number(
      data.goods_received ??
        data.goodsReceived ??
        (Array.isArray(data.goods) ? data.goods.length : 0),
    );

    const totalProductValue = Number(
      data.total_product_value ?? data.totalProductValue ?? 0,
    );

    const byLevel = data.byLevel || {};
    const byQuality = data.byQuality || {};

    const levelText =
      Object.keys(byLevel).length > 0
        ? Object.entries(byLevel)
            .map(([level, count]) => `${level}: ${count}`)
            .join(", ")
        : "None";

    const qualityText =
      Object.keys(byQuality).length > 0
        ? Object.entries(byQuality)
            .map(([quality, count]) => `${quality}: ${count}`)
            .join(", ")
        : "None";

    showGoodsClaimModal(data);
    await loadGoodsPreview();
    await loadGoodsInventory(username);
    await loadGoodsRedemptionPosition(username);
    await loadGoodsRedemptionLeaderboard();
  } catch (err) {
    console.error("Claim Goods error:", err);
    alert("Failed to claim Goods.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Claim All Goods";
    }
  }
}
async function submitSelectedGoodsForRedemption() {
  const username = getGoodsLoggedInUser();
  const button = document.getElementById("goods-submit-selected-btn");

  const selectedBoxes = Array.from(
    document.querySelectorAll(".goods-submit-checkbox:checked"),
  );

  if (!username) {
    alert("Please login first.");
    return;
  }

  if (selectedBoxes.length === 0) {
    alert("Please select at least one Good to submit.");
    return;
  }

  let goodsIds = [];
  let selectedGoodsCount = 0;
  let selectedValue = 0;

  selectedBoxes.forEach((box) => {
    const allIds = String(box.value || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const qtyInputId = box.dataset.qtyInputId;
    const qtyInput = qtyInputId ? document.getElementById(qtyInputId) : null;

    const maxQty = Number(box.dataset.goodCount || allIds.length || 0);
    const eachPV = Number(box.dataset.goodValue || 0);

    let qty = qtyInput ? Number(qtyInput.value || 0) : 1;

    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    if (maxQty > 0 && qty > maxQty) qty = maxQty;
    if (qty > allIds.length) qty = allIds.length;

    if (qtyInput) {
      qtyInput.value = qty;
    }

    const idsToSubmit = allIds.slice(0, qty);

    goodsIds = goodsIds.concat(idsToSubmit);
    selectedGoodsCount += idsToSubmit.length;
    selectedValue += idsToSubmit.length * eachPV;
  });

  if (goodsIds.length === 0) {
    alert("Please select at least one valid Good.");
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Submitting...";
    }

    const response = await fetch(
      `${GOODS_API_BASE}/goods-redemption/${username}/burn`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mde-actor": username,
        },
        body: JSON.stringify({
          username,
          goods_ids: goodsIds,
        }),
      },
    );

    const data = await response.json();

    if (!data.success) {
      alert(data.error || "Failed to submit Goods.");
      return;
    }

    showGoodsSubmitSuccessModal(data, selectedGoodsCount);

    await loadGoodsInventory(username);
    await loadGoodsRedemptionPosition(username);
    await loadGoodsRedemptionLeaderboard();
    updateGoodsSelectedSummary();
  } catch (err) {
    console.error("Submit Goods redemption error:", err);
    alert("Failed to submit Goods. Please try again.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Submit to Redemption";
    }
  }
}
function setupGoodsSubnav() {
  const buttons = document.querySelectorAll(".goods-subnav-btn");
  const panels = document.querySelectorAll(".goods-tab-panel");

  if (!buttons.length || !panels.length) return;

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.dataset.goodsTab;

      buttons.forEach((btn) => {
        btn.classList.toggle("active", btn === button);
      });

      panels.forEach((panel) => {
        panel.classList.toggle(
          "active",
          panel.dataset.goodsPanel === targetTab,
        );
      });
    });
  });
}
document.addEventListener("DOMContentLoaded", () => {
  setupGoodsSubnav();
  setupGoodsInventorySelection();
  const refreshBtn = document.getElementById("goods-refresh-btn");
  const claimBtn = document.getElementById("goods-claim-btn");
  const submitBtn = document.getElementById("goods-submit-selected-btn");
  const loadHistoryBtn = document.getElementById("goods-load-history-btn");
  const claimModalCloseBtn = document.getElementById("goods-claim-modal-close");
  const claimModalOkBtn = document.getElementById("goods-claim-modal-ok");
  const submitSuccessCloseBtn = document.getElementById(
    "goods-submit-success-close",
  );
  const submitSuccessOkBtn = document.getElementById("goods-submit-success-ok");
  const claimConfirmCloseBtn = document.getElementById(
    "goods-claim-confirm-close",
  );
  const claimConfirmCancelBtn = document.getElementById(
    "goods-claim-confirm-cancel",
  );
  const claimConfirmOkBtn = document.getElementById("goods-claim-confirm-ok");
  const submitConfirmCloseBtn = document.getElementById(
    "goods-submit-confirm-close",
  );
  const submitConfirmCancelBtn = document.getElementById(
    "goods-submit-confirm-cancel",
  );
  const submitConfirmOkBtn = document.getElementById("goods-submit-confirm-ok");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadGoodsPreview);
  }

  if (claimBtn) {
    claimBtn.addEventListener("click", openGoodsClaimConfirmModal);
  }
  if (submitBtn) {
    submitBtn.addEventListener("click", openGoodsSubmitConfirmModal);
  }
  if (claimModalCloseBtn) {
    claimModalCloseBtn.addEventListener("click", closeGoodsClaimModal);
  }

  if (claimModalOkBtn) {
    claimModalOkBtn.addEventListener("click", closeGoodsClaimModal);
  }
  if (claimConfirmCloseBtn) {
    claimConfirmCloseBtn.addEventListener("click", closeGoodsClaimConfirmModal);
  }

  if (claimConfirmCancelBtn) {
    claimConfirmCancelBtn.addEventListener(
      "click",
      closeGoodsClaimConfirmModal,
    );
  }

  if (claimConfirmOkBtn) {
    claimConfirmOkBtn.addEventListener("click", () => {
      closeGoodsClaimConfirmModal();
      claimAllGoods();
    });
  }
  if (submitConfirmCloseBtn) {
    submitConfirmCloseBtn.addEventListener(
      "click",
      closeGoodsSubmitConfirmModal,
    );
  }

  if (submitConfirmCancelBtn) {
    submitConfirmCancelBtn.addEventListener(
      "click",
      closeGoodsSubmitConfirmModal,
    );
  }

  if (submitConfirmOkBtn) {
    submitConfirmOkBtn.addEventListener("click", () => {
      closeGoodsSubmitConfirmModal();
      submitSelectedGoodsForRedemption();
    });
  }
  if (submitSuccessCloseBtn) {
    submitSuccessCloseBtn.addEventListener(
      "click",
      closeGoodsSubmitSuccessModal,
    );
  }

  if (submitSuccessOkBtn) {
    submitSuccessOkBtn.addEventListener("click", closeGoodsSubmitSuccessModal);
  }
  if (loadHistoryBtn) {
    loadHistoryBtn.addEventListener("click", () => {
      loadGoodsRedemptionHistory();
    });
  }
  loadGoodsPreview();
  loadGoodsRedemptionPosition(getGoodsLoggedInUser());
  loadGoodsRedemptionLeaderboard();
});
