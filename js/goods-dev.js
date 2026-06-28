// js/goods-dev.js
// Temporary file name only.
// Internal code uses final-compatible Goods names.

const GOODS_LOCAL_API = "http://localhost:10000";
const GOODS_PROD_API = "https://mydempire-backend-1.onrender.com";

const GOODS_API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? GOODS_LOCAL_API
    : GOODS_PROD_API;

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

  box.innerHTML = items
    .map((item) => {
      const qualityClass = `goods-quality-${String(item.quality || "").toLowerCase()}`;
      const levelClass = `goods-level-${String(item.product_level || "").toLowerCase()}`;

      return `
        <div class="goods-product-card ${qualityClass} ${levelClass}">
          <div class="goods-product-top">
            <span class="goods-product-industry">${escapeGoodsHtml(item.industry || "UNKNOWN")}</span>
            <span class="goods-product-quality">${escapeGoodsHtml(item.quality || "STANDARD")}</span>
          </div>

          <div class="goods-product-name">
            ${escapeGoodsHtml(item.product_name || "Unknown Product")}
          </div>

          <div class="goods-product-meta">
            <span>${escapeGoodsHtml(item.product_level || "--")}</span>
            <span>Value: ${escapeGoodsHtml(item.final_value || 0)}</span>
          </div>

          <div class="goods-product-footer">
            <span>Factory #${escapeGoodsHtml(item.factory_id || "--")}</span>
            <span>${escapeGoodsHtml(formatGoodsDate(item.claimed_at))}</span>
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
    "goods-rotation-status",
    `Rotation: starts at position ${
      Number(data.rotationCursor || 0) + 1
    } • Next claim starts at position ${
      Number(data.nextRotationCursor || 0) + 1
    }`,
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

  setGoodsClaimButtonState(
    readyFactoryCount > 0,
    readyFactoryCount > 0 ? "Claim All Goods" : "Claim Cooldown",
  );
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

async function claimAllGoods() {
  const username = getGoodsLoggedInUser();

  if (!username) {
    alert("Please connect wallet first.");
    return;
  }

  if (goodsClaimInProgress) {
    return;
  }

  const readyFactoryCount = Number(latestGoodsPreview?.readyFactoryCount || 0);

  if (readyFactoryCount <= 0) {
    alert("No Goods are ready yet.");
    return;
  }

  const confirmClaim = confirm(
    `Claim Goods from ${readyFactoryCount} ready factories now?`,
  );

  if (!confirmClaim) {
    return;
  }

  goodsClaimInProgress = true;
  setGoodsClaimButtonState(false, "Claiming...");
  setGoodsText("goods-status", "Claiming Goods...");

  try {
    const response = await fetch(`${GOODS_API_BASE}/goods/${username}/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mde-actor": username,
      },
      body: JSON.stringify({
        username,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to claim Goods.");
    }

    alert(buildGoodsClaimSummary(data));

    await loadGoodsPreview();
  } catch (err) {
    console.error("Goods claim error:", err);

    alert(err.message || "Failed to claim Goods.");

    await loadGoodsPreview();
  } finally {
    goodsClaimInProgress = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("goods-refresh-btn");
  const claimBtn = document.getElementById("goods-claim-btn");

  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadGoodsPreview);
  }

  if (claimBtn) {
    claimBtn.addEventListener("click", claimAllGoods);
  }

  loadGoodsPreview();
});
